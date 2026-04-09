module Api
  module Dealer
    class BidsController < Api::Dealer::BaseController
      before_action :ensure_unlocked!
      before_action :ensure_package_not_awarded!, only: [:update, :submit]
      before_action :load_bid

      def show
        bid_package = @invite.bid_package
        line_items_by_spec = @bid.bid_line_items.group_by(&:spec_item_id)
        excluded_spec_item_ids = bid_package.excluded_spec_item_ids
        eligible_scope = bid_package.spec_items.active
        eligible_scope = eligible_scope.where.not(id: excluded_spec_item_ids) if excluded_spec_item_ids.any?
        eligible_spec_item_ids = eligible_scope.pluck(:id)
        eligible_spec_item_id_set = eligible_spec_item_ids.each_with_object({}) { |id, memo| memo[id] = true }

        current_awards = bid_package.bid_row_awards
                                   .includes(bid: :invite)
                                   .joins(:spec_item)
                                   .merge(bid_package.spec_items.active)
                                   .to_a
                                   .select { |award| eligible_spec_item_id_set[award.spec_item_id] }
        approval_tracking_view = eligible_spec_item_ids.any? && current_awards.length >= eligible_spec_item_ids.length
        awards_by_spec_item_id = current_awards.index_by(&:spec_item_id)
        won_row_count = current_awards.count { |award| award.bid_id == @bid.id }
        lost_row_count = [current_awards.length - won_row_count, 0].max

        spec_scope = bid_package.spec_items.active.order(:id)
        spec_scope = spec_scope.where.not(id: excluded_spec_item_ids) if approval_tracking_view && excluded_spec_item_ids.any?

        spec_rows = spec_scope.flat_map do |item|
          lines = line_items_by_spec[item.id] || []
          basis_line = lines.find { |line| !line.is_substitution? }
          substitution_line = lines.find(&:is_substitution?)

          if approval_tracking_view
            award = awards_by_spec_item_id[item.id]
            awarded_to_current_bid = award.present? && award.bid_id == @bid.id
            selected_mode = awarded_to_current_bid ? award.price_source : nil
            selected_line =
              if selected_mode == 'alt'
                substitution_line || basis_line
              elsif selected_mode == 'bod'
                basis_line || substitution_line
              else
                basis_line || substitution_line
              end

            [build_award_tracking_row(item, lines, selected_line, award, awarded_to_current_bid)]
          else
            rows = [build_basis_row(item, lines, basis_line)]
            rows << build_substitution_row(item, lines, substitution_line) if substitution_line.present?
            rows
          end
        end

        pricing_subtotal = pricing_subtotal_for(spec_scope, awards_by_spec_item_id, approval_tracking_view)
        pricing_amounts = @bid.general_pricing_amounts(subtotal: pricing_subtotal)

        render json: {
          bid: {
            id: @bid.id,
            state: @bid.state,
            submitted_at: @bid.submitted_at,
            project_name: bid_package.project&.name,
            bid_package_name: bid_package.name,
            instructions: bid_package.instructions,
            custom_questions: bid_package.custom_questions,
            custom_question_responses: @bid.custom_question_responses,
            active_general_fields: bid_package.active_general_fields,
            post_award_enabled: eligible_spec_item_ids.any?,
            approval_tracking_enabled: approval_tracking_view,
            awarded_vendor: won_row_count.positive?,
            won_row_count: won_row_count,
            lost_row_count: lost_row_count,
            post_award_uploads: bid_package.post_award_uploads
                                         .where(invite_id: @invite.id)
                                         .order(created_at: :desc)
                                         .map { |upload| serialize_post_award_upload(upload) },
            delivery_amount: pricing_amounts['delivery_amount'],
            install_amount: pricing_amounts['install_amount'],
            escalation_amount: pricing_amounts['escalation_amount'],
            contingency_amount: pricing_amounts['contingency_amount'],
            sales_tax_amount: pricing_amounts['sales_tax_amount'],
            delivery_percent: @bid.delivery_percent,
            install_percent: @bid.install_percent,
            escalation_percent: @bid.escalation_percent,
            contingency_percent: @bid.contingency_percent,
            sales_tax_percent: @bid.sales_tax_percent,
            line_items: spec_rows
          }
        }
      end

      def update
        if @bid.submitted?
          return render json: { error: 'Bid already submitted and locked' }, status: :conflict
        end

        active_spec_item_ids = @invite.bid_package.spec_items.active.pluck(:id).to_set

        ActiveRecord::Base.transaction do
          submitted_keys = {}

          line_items_params.each do |line_item|
            spec_item_id = line_item[:spec_item_id].to_i
            is_substitution = ActiveModel::Type::Boolean.new.cast(line_item[:is_substitution])

            attrs = line_item.to_h.slice(
              'quantity',
              'unit_price',
              'discount_percent',
              'tariff_percent',
              'lead_time_days',
              'dealer_notes',
              'substitution_product_name',
              'substitution_brand_name'
            )

            @bid.bid_line_items.find_or_initialize_by(
              spec_item_id: spec_item_id,
              is_substitution: is_substitution
            ).update!(attrs)

            submitted_keys[[spec_item_id, is_substitution]] = true
          end

          @bid.bid_line_items.each do |line_item|
            next unless active_spec_item_ids.include?(line_item.spec_item_id)

            key = [line_item.spec_item_id, line_item.is_substitution?]
            line_item.destroy! unless submitted_keys[key]
          end

          @bid.update!({ state: :draft }.merge(pricing_params.to_h))
        end

        render json: { saved: true, state: @bid.state, updated_at: @bid.reload.updated_at }
      rescue ActiveRecord::RecordInvalid => e
        render_unprocessable!(e.record.errors.full_messages)
      end

      def submit
        if @bid.submitted?
          return render json: { error: 'Bid already submitted' }, status: :conflict
        end
        validation_errors = submit_quantity_errors
        if validation_errors.any?
          return render json: { errors: validation_errors }, status: :unprocessable_entity
        end

        ActiveRecord::Base.transaction do
          @bid.update!(state: :submitted, submitted_at: Time.current)
          @bid.create_submission_version!
        end

        render json: { submitted: true, submitted_at: @bid.submitted_at }
      end

      def create_post_award_upload
        bid_package = @invite.bid_package
        bid = @invite.bid
        unless bid
          return render json: { error: 'No bid exists for this invite' }, status: :forbidden
        end
        approval_tracking_view = bid_package.package_award_status == 'fully_awarded'

        spec_item_id = params[:spec_item_id].presence
        spec_item = nil
        is_substitution = ActiveModel::Type::Boolean.new.cast(params[:is_substitution])
        if spec_item_id.present?
          spec_item = bid_package.spec_items.active.find(spec_item_id)
          unless approval_tracking_view || is_substitution
            return render json: { error: 'Pre-award uploads are only available for substitution rows' }, status: :forbidden
          end
        elsif bid_package.package_award_status == 'fully_awarded' && bid_package.awarded_bid_id != bid.id
          return render json: { error: 'General uploads are only available for the sole winner' }, status: :forbidden
        end

        uploaded_file = params[:file]
        upload_attrs = {
          spec_item: spec_item,
          invite: @invite,
          uploader_role: :vendor,
          file_name: uploaded_file&.original_filename.presence || params.require(:file_name),
          note: params[:note]
        }
        if spec_item.present? && is_substitution
          upload_attrs[:requirement_key] = PostAwardUpload::SUBSTITUTION_ROW_REQUIREMENT_KEY
        end
        if PostAwardUpload.supports_substitution_flag?
          upload_attrs[:is_substitution] = spec_item.present? ? is_substitution : false
        end
        upload = bid_package.post_award_uploads.create!(upload_attrs)
        upload.persist_uploaded_file!(uploaded_file) if uploaded_file.present?

        render json: {
          uploaded: true,
          upload: serialize_post_award_upload(upload)
        }, status: :created
      rescue StandardError => e
        render json: { errors: [e.message] }, status: :unprocessable_entity
      end

      def download_post_award_upload
        upload = @invite.bid_package.post_award_uploads.where(invite_id: @invite.id).find(params[:upload_id])
        return render json: { error: 'Uploaded file not found' }, status: :not_found unless upload.file_available?

        send_file upload.stored_file_path,
                  filename: upload.file_name,
                  type: upload.content_type.presence || 'application/octet-stream',
                  disposition: 'attachment'
      end

      def delete_post_award_upload
        upload = @invite.bid_package.post_award_uploads.where(invite_id: @invite.id).find(params[:upload_id])
        return render json: { error: 'Only bidder uploads can be deleted from this view' }, status: :forbidden unless upload.vendor?

        file_path = upload.file_available? ? upload.stored_file_path.to_s : nil
        upload.destroy!
        File.delete(file_path) if file_path.present? && File.exist?(file_path)

        render json: { deleted: true, upload_id: upload.id }
      rescue StandardError => e
        render json: { errors: [e.message] }, status: :unprocessable_entity
      end

      private

      def load_bid
        @bid = @invite.bid || @invite.create_bid!
      end

      def build_basis_row(item, lines, line)
        {
          spec_item_id: item.id,
          sku: item.sku,
          product_name: item.product_name,
          brand_name: item.manufacturer,
          quantity: effective_quantity(item, lines: lines, preferred_line: line),
          uom: item.uom,
          is_substitution: false,
          can_upload_post_award_files: false,
          unit_price: line&.unit_price,
          discount_percent: line&.discount_percent,
          tariff_percent: line&.tariff_percent,
          unit_net_price: line&.unit_net_price,
          lead_time_days: line&.lead_time_days,
          dealer_notes: line&.dealer_notes
        }
      end

      def build_substitution_row(item, lines, line)
        {
          spec_item_id: item.id,
          sku: item.sku,
          product_name: line&.substitution_product_name,
          brand_name: line&.substitution_brand_name,
          quantity: effective_quantity(item, lines: lines, preferred_line: line),
          uom: item.uom,
          is_substitution: true,
          can_upload_post_award_files: true,
          unit_price: line&.unit_price,
          discount_percent: line&.discount_percent,
          tariff_percent: line&.tariff_percent,
          unit_net_price: line&.unit_net_price,
          lead_time_days: line&.lead_time_days,
          dealer_notes: line&.dealer_notes,
          substitution_product_name: line&.substitution_product_name,
          substitution_brand_name: line&.substitution_brand_name
        }
      end

      def build_award_tracking_row(item, lines, line, award, awarded_to_current_bid)
        mode = if awarded_to_current_bid
                 award&.price_source.presence || (line&.is_substitution? ? 'alt' : 'bod')
               else
                 line&.is_substitution? ? 'alt' : 'bod'
               end
        {
          spec_item_id: item.id,
          sku: item.sku,
          product_name: line&.is_substitution? ? line&.substitution_product_name : item.product_name,
          brand_name: line&.is_substitution? ? line&.substitution_brand_name : item.manufacturer,
          quantity: effective_quantity(item, lines: lines, preferred_line: line),
          uom: item.uom,
          is_substitution: mode == 'alt',
          approved_source: awarded_to_current_bid ? mode : nil,
          award_status: awarded_to_current_bid ? 'won' : 'lost',
          winning_vendor_email: award&.bid&.invite&.dealer_email,
          can_upload_post_award_files: awarded_to_current_bid,
          unit_price: awarded_to_current_bid ? (award&.unit_price_snapshot || line&.unit_price) : line&.unit_price,
          discount_percent: line&.discount_percent,
          tariff_percent: line&.tariff_percent,
          unit_net_price: awarded_to_current_bid ? line&.unit_net_price : nil,
          lead_time_days: line&.lead_time_days,
          dealer_notes: line&.dealer_notes,
          extended_price: awarded_to_current_bid ? award&.extended_price_snapshot : nil
        }
      end

      def pricing_subtotal_for(spec_scope, awards_by_spec_item_id, approval_tracking_view)
        spec_scope.sum do |item|
          if approval_tracking_view
            award = awards_by_spec_item_id[item.id]
            award&.bid_id == @bid.id ? award.extended_price_snapshot.to_d : 0.to_d
          else
            lines = @bid.bid_line_items.select { |line| line.spec_item_id == item.id }
            basis_line = lines.find { |line| !line.is_substitution? }
            substitution_line = lines.find(&:is_substitution?)
            selected_line = basis_line&.unit_net_price.present? ? basis_line : substitution_line
            quantity = effective_quantity(item, lines: lines, preferred_line: selected_line)
            unit_net = selected_line&.unit_net_price
            quantity.present? && unit_net.present? ? quantity.to_d * unit_net.to_d : 0.to_d
          end
        end
      end

      def selected_mode_for(spec_item_id, invite_id, comparison_snapshot)
        raw = comparison_snapshot.is_a?(Hash) ? comparison_snapshot : {}
        cell_map = raw['cell_price_mode'] || raw[:cell_price_mode] || {}
        by_spec = cell_map[spec_item_id.to_s] || cell_map[spec_item_id.to_i]
        mode = if by_spec.is_a?(Hash)
                 by_spec[invite_id.to_s] || by_spec[invite_id.to_i]
               end
        %w[bod alt].include?(mode) ? mode : nil
      end

      def line_items_params
        params.require(:line_items).map do |item|
          item.permit(
            :spec_item_id,
            :is_substitution,
            :quantity,
            :unit_price,
            :discount_percent,
            :tariff_percent,
            :lead_time_days,
            :dealer_notes,
            :substitution_product_name,
            :substitution_brand_name
          )
        end
      end

      def pricing_params
        return ActionController::Parameters.new unless params[:pricing].present?

        params.require(:pricing).permit(
          :delivery_amount,
          :install_amount,
          :escalation_amount,
          :contingency_amount,
          :sales_tax_amount,
          :delivery_percent,
          :install_percent,
          :escalation_percent,
          :contingency_percent,
          :sales_tax_percent,
          custom_question_responses: {}
        )
      end

      def ensure_package_not_awarded!
        return unless @invite.bid_package.package_award_status == 'fully_awarded'

        render json: { error: 'Bid package has already been awarded and is now locked' }, status: :conflict
      end

      def effective_quantity(item, lines:, preferred_line: nil)
        return preferred_line.quantity if preferred_line&.quantity.present?

        line_with_quantity = lines.find { |line| line.quantity.present? }
        return line_with_quantity.quantity if line_with_quantity.present?

        item.quantity
      end

      def submit_quantity_errors
        active_spec_items = @invite.bid_package.spec_items.active.to_a
        line_items_by_spec = @bid.bid_line_items.group_by(&:spec_item_id)

        active_spec_items.each_with_object([]) do |item, errors|
          lines = line_items_by_spec[item.id] || []
          begin
            quantity = effective_quantity(item, lines: lines, preferred_line: lines.find { |line| !line.is_substitution? })
            quantity_number = quantity.to_d if quantity.present?
            if quantity_number.blank? || quantity_number <= 0
              errors << "Quantity must be greater than 0 for #{item.sku.presence || item.product_name.presence || "spec item #{item.id}"}"
            end
          rescue ArgumentError
            errors << "Quantity must be numeric for #{item.sku.presence || item.product_name.presence || "spec item #{item.id}"}"
          end
        end
      end

      def serialize_post_award_upload(upload)
        {
          id: upload.id,
          file_name: upload.file_name,
          note: upload.note,
          spec_item_id: upload.spec_item_id,
          is_substitution: upload.substitution_upload?,
          byte_size: upload.byte_size,
          uploader_role: upload.uploader_role,
          uploaded_by: upload.invite&.dealer_name || upload.uploader_role.to_s.titleize,
          download_url: upload.file_available? ? "/api/invites/#{@invite.token}/post_award_uploads/#{upload.id}/download" : nil,
          uploaded_at: upload.created_at,
          requirement_key: upload.api_requirement_key
        }
      end
    end
  end
end
