require 'zip'

module Api
  module Admin
    class BidPackagesController < Api::BaseController
      before_action :ensure_not_awarded!, only: [:update, :import_rows, :deactivate_spec_item, :reactivate_spec_item]

      def index
        bid_packages = BidPackage
                       .includes(:project, :invites, :spec_items, awarded_bid: :invite)
                       .order(created_at: :desc)
                       .limit(200)

        render json: {
          bid_packages: bid_packages.map do |bid_package|
            serialize_bid_package(bid_package)
          end
        }
      end

      def preview
        Project.find(params[:project_id])

        result = CsvImports::BidPackagePreviewService.new(
          csv_content: params.require(:csv_content),
          source_profile: params[:source_profile]
        ).call

        if result.valid?
          render json: {
            valid: true,
            source_profile: result.profile,
            row_count: result.row_count,
            sample_rows: result.rows.first(10)
          }
        else
          render json: {
            valid: false,
            row_count: result.row_count,
            errors: result.errors
          }, status: :unprocessable_entity
        end
      end

      def create
        project = Project.find(params[:project_id])

        preview = CsvImports::BidPackagePreviewService.new(
          csv_content: params.require(:csv_content),
          source_profile: params[:source_profile]
        ).call

        return render_unprocessable!(preview.errors) unless preview.valid?

        result = CsvImports::BidPackageCommitService.new(
          project: project,
          package_name: params.require(:name),
          source_filename: params.require(:source_filename),
          parsed_rows: preview.rows,
          visibility: package_settings_params[:visibility],
          active_general_fields: package_settings_params[:active_general_fields],
          instructions: package_settings_params[:instructions],
          custom_questions: package_settings_params[:custom_questions]
        ).call

        if result.success?
          render json: {
            bid_package: serialize_bid_package(result.bid_package),
            imported_items_count: result.imported_items_count
          }, status: :created
        else
          render_unprocessable!(result.errors)
        end
      end

      def update
        bid_package = BidPackage.find(params[:id])
        bid_package.update!(update_params)

        render json: { bid_package: serialize_bid_package(bid_package) }
      rescue ActiveRecord::RecordInvalid => e
        render_unprocessable!(e.record.errors.full_messages)
      end

      def destroy
        bid_package = BidPackage.find(params[:id])
        bid_package.destroy!

        render json: { deleted: true, bid_package_id: bid_package.id }
      end

      def import_rows
        bid_package = BidPackage.find(params[:id])

        preview = CsvImports::BidPackagePreviewService.new(
          csv_content: params.require(:csv_content),
          source_profile: params[:source_profile]
        ).call

        return render_unprocessable!(preview.errors) unless preview.valid?

        result = CsvImports::BidPackageAppendService.new(
          bid_package: bid_package,
          source_filename: params.require(:source_filename),
          parsed_rows: preview.rows
        ).call

        if result.success?
          render json: {
            bid_package: serialize_bid_package(result.bid_package),
            imported_items_count: result.imported_items_count
          }
        else
          render_unprocessable!(result.errors)
        end
      end

      def deactivate_spec_item
        bid_package = BidPackage.find(params[:id])
        spec_item = bid_package.spec_items.find(params[:spec_item_id])
        spec_item.update!(active: false)

        render json: { deactivated: true, spec_item_id: spec_item.id }
      rescue ActiveRecord::RecordInvalid => e
        render_unprocessable!(e.record.errors.full_messages)
      end

      def reactivate_spec_item
        bid_package = BidPackage.find(params[:id])
        spec_item = bid_package.spec_items.find(params[:spec_item_id])
        spec_item.update!(active: true)

        render json: { reactivated: true, spec_item_id: spec_item.id }
      rescue ActiveRecord::RecordInvalid => e
        render_unprocessable!(e.record.errors.full_messages)
      end

      def award
        bid_package = BidPackage.find(params[:id])
        bid = bid_package.bids.includes(:invite).find(params.require(:bid_id))

        result = Awards::BidPackageRowAwardService.new(
          bid_package: bid_package,
          selections: build_bulk_row_award_selections(bid_package, bid, comparison_snapshot_params),
          awarded_by: awarding_user_name
        ).call

        return render_row_award_success(result) if result.success?
 
        render_award_failure(result)
      rescue StandardError => e
        render_award_exception(e)
      end

      def award_rows
        bid_package = BidPackage.find(params[:id])

        result = Awards::BidPackageRowAwardService.new(
          bid_package: bid_package,
          selections: row_award_selections_params,
          awarded_by: awarding_user_name
        ).call

        return render_row_award_success(result) if result.success?

        render_award_failure(result)
      rescue StandardError => e
        render_award_exception(e)
      end

      def clear_award_rows
        bid_package = BidPackage.find(params[:id])
        spec_item_ids = Array(params[:spec_item_ids]).map(&:to_i).uniq
        return render_unprocessable!('Select at least one row award to remove') if spec_item_ids.empty?

        cleared_count = bid_package.bid_row_awards.where(spec_item_id: spec_item_ids).delete_all
        bid_package.refresh_award_summary!

        render json: {
          cleared: true,
          cleared_count: cleared_count,
          bid_package_id: bid_package.id,
          awarded_bid_id: bid_package.awarded_bid_id,
          awarded_at: bid_package.awarded_at,
          package_award_status: bid_package.package_award_status,
          awarded_row_count: bid_package.awarded_row_count,
          eligible_row_count: bid_package.eligible_award_row_count,
          award_winner_scope: bid_package.award_winner_scope
        }
      rescue StandardError => e
        render_award_exception(e)
      end

      def clear_bidder_awards
        bid_package = BidPackage.find(params[:id])
        bid_id = params[:bid_id].to_i
        return render_unprocessable!('Select a bidder to clear awards from') if bid_id <= 0

        cleared_count = bid_package.bid_row_awards.where(bid_id: bid_id).delete_all
        bid_package.refresh_award_summary!

        render json: {
          cleared: true,
          cleared_count: cleared_count,
          bid_package_id: bid_package.id,
          awarded_bid_id: bid_package.awarded_bid_id,
          awarded_at: bid_package.awarded_at,
          package_award_status: bid_package.package_award_status,
          awarded_row_count: bid_package.awarded_row_count,
          eligible_row_count: bid_package.eligible_award_row_count,
          award_winner_scope: bid_package.award_winner_scope
        }
      rescue StandardError => e
        render_award_exception(e)
      end

      def change_award
        bid_package = BidPackage.find(params[:id])
        bid = bid_package.bids.includes(:invite).find(params.require(:bid_id))

        result = Awards::BidPackageRowAwardService.new(
          bid_package: bid_package,
          selections: build_bulk_row_award_selections(bid_package, bid, comparison_snapshot_params),
          awarded_by: awarding_user_name
        ).call

        return render_row_award_success(result) if result.success?

        render_award_failure(result)
      rescue StandardError => e
        render_award_exception(e)
      end

      def clear_award
        bid_package = BidPackage.find(params[:id])
        cleared_count = bid_package.bid_row_awards.delete_all
        bid_package.refresh_award_summary!

        render json: {
          cleared: true,
          cleared_count: cleared_count,
          bid_package_id: bid_package.id,
          awarded_bid_id: bid_package.awarded_bid_id,
          awarded_at: bid_package.awarded_at,
          package_award_status: bid_package.package_award_status,
          awarded_row_count: bid_package.awarded_row_count,
          eligible_row_count: bid_package.eligible_award_row_count,
          award_winner_scope: bid_package.award_winner_scope
        }
      rescue StandardError => e
        render_award_exception(e)
      end

      def award_scope
        bid_package = BidPackage.find(params[:id])
        bid_package.update!(excluded_spec_item_ids: normalized_spec_item_ids(params[:excluded_spec_item_ids]))
        bid_package.refresh_award_summary! if bid_package.award_committed?

        render json: {
          updated: true,
          bid_package_id: bid_package.id,
          excluded_spec_item_ids: bid_package.excluded_spec_item_ids,
          package_award_status: bid_package.package_award_status,
          awarded_row_count: bid_package.awarded_row_count,
          eligible_row_count: bid_package.eligible_award_row_count,
          award_winner_scope: bid_package.award_winner_scope
        }
      rescue ActiveRecord::RecordInvalid => e
        render_unprocessable!(e.record.errors.full_messages)
      end

      def create_spec_item_approval_component
        bid_package = BidPackage.find(params[:id])
        spec_item = bid_package.spec_items.find(params[:spec_item_id])
        component = bid_package.spec_item_approval_components.create!(
          spec_item: spec_item,
          label: params[:label].presence || next_component_label(spec_item),
          position: next_component_position(spec_item)
        )

        render json: {
          created: true,
          component: serialize_spec_item_component(component, spec_item)
        }, status: :created
      rescue StandardError => e
        render_award_exception(e)
      end

      def update_spec_item_approval_component
        bid_package = BidPackage.find(params[:id])
        spec_item = bid_package.spec_items.find(params[:spec_item_id])
        component = spec_item.spec_item_approval_components.find(params[:component_id])
        component.update!(label: params[:label].to_s.strip.presence || component.label)

        render json: {
          updated: true,
          component: serialize_spec_item_component(component, spec_item)
        }
      rescue StandardError => e
        render_award_exception(e)
      end

      def delete_spec_item_approval_component
        bid_package = BidPackage.find(params[:id])
        spec_item = bid_package.spec_items.find(params[:spec_item_id])
        component = spec_item.spec_item_approval_components.find(params[:component_id])
        component.destroy!

        render json: { deleted: true, component_id: component.id, spec_item_id: spec_item.id }
      rescue StandardError => e
        render_award_exception(e)
      end

      def activate_spec_item_component_requirement
        bid_package = BidPackage.find(params[:id])
        spec_item, requirement_key = load_valid_requirement!(bid_package)
        return if performed?

        component = load_requirement_component!(spec_item)
        return if performed?

        clear_parent_requirement_approval!(bid_package, spec_item.id, requirement_key)
        approval = find_or_initialize_requirement_approval(
          bid_package,
          spec_item.id,
          requirement_key,
          component_id: component.id,
          allow_parent_when_components_active: true
        )
        approval.status = :pending
        approval.approved_at = nil
        approval.approved_by = nil
        approval.needs_fix_dates ||= []
        approval.action_history ||= []
        approval.save! if approval.changed?

        render json: {
          activated: true,
          spec_item_id: spec_item.id,
          requirement_key: requirement_key,
          component: serialize_spec_item_component(component, spec_item),
          requirement: serialize_requirement_for_dashboard(spec_item, requirement_key, bid_package.awarded_bid_id)
        }
      rescue StandardError => e
        render_award_exception(e)
      end

      def deactivate_spec_item_component_requirement
        bid_package = BidPackage.find(params[:id])
        spec_item, requirement_key = load_valid_requirement!(bid_package)
        return if performed?

        component = load_requirement_component!(spec_item)
        return if performed?

        deactivated_count = bid_package.spec_item_requirement_approvals.where(
          spec_item_id: spec_item.id,
          requirement_key: requirement_key,
          bid_id: bid_package.awarded_bid_id,
          component_id: component.id
        ).delete_all

        render json: {
          deactivated: true,
          deactivated_count: deactivated_count,
          spec_item_id: spec_item.id,
          requirement_key: requirement_key,
          component: serialize_spec_item_component(component, spec_item),
          requirement: serialize_requirement_for_dashboard(spec_item, requirement_key, bid_package.awarded_bid_id, component: component)
        }
      rescue StandardError => e
        render_award_exception(e)
      end

      def approve_spec_item_requirement
        bid_package = BidPackage.find(params[:id])

        spec_item, requirement_key = load_valid_requirement!(bid_package)
        return if performed?

        approved_at = params[:approved_at].present? ? Time.zone.parse(params[:approved_at].to_s) : Time.current
        approval = find_or_initialize_requirement_approval(bid_package, spec_item.id, requirement_key)
        return if performed?
        existing_needs_fix_dates = approval.needs_fix_dates_array
        approval.status = :approved
        approval.approved_at = approved_at
        approval.approved_by = params[:approved_by].presence || 'Designer'
        approval.needs_fix_dates = existing_needs_fix_dates
        append_action_history(approval, action: 'approved', at: approved_at)
        approval.save!

        render json: {
          status: approval.status,
          approved: true,
          spec_item_id: spec_item.id,
          requirement_key: requirement_key,
          component_id: approval.component_id,
          approved_at: approval.approved_at,
          approved_by: approval.approved_by,
          needs_fix_dates: approval.needs_fix_dates_array
        }
      rescue StandardError => e
        render_award_exception(e)
      end

      def mark_spec_item_requirement_needs_fix
        bid_package = BidPackage.find(params[:id])

        spec_item, requirement_key = load_valid_requirement!(bid_package)
        return if performed?

        needs_fix_at = params[:needs_fix_at].present? ? Time.zone.parse(params[:needs_fix_at].to_s) : Time.current
        approval = find_or_initialize_requirement_approval(bid_package, spec_item.id, requirement_key)
        return if performed?
        needs_fix_dates = approval.needs_fix_dates_array
        needs_fix_dates << needs_fix_at.iso8601

        approval.status = :needs_revision
        approval.approved_at = nil
        approval.approved_by = nil
        approval.needs_fix_dates = needs_fix_dates
        append_action_history(approval, action: 'needs_fix', at: needs_fix_at)
        approval.save!

        render json: {
          status: approval.status,
          spec_item_id: spec_item.id,
          requirement_key: requirement_key,
          component_id: approval.component_id,
          needs_fix_dates: approval.needs_fix_dates_array,
          needs_fix_at: needs_fix_dates.last
        }
      rescue StandardError => e
        render_award_exception(e)
      end

      def unapprove_spec_item_requirement
        bid_package = BidPackage.find(params[:id])

        spec_item, requirement_key = load_valid_requirement!(bid_package)
        return if performed?

        action_type = params[:action_type].to_s == 'reset' ? 'reset' : 'unapproved'
        action_at = params[:action_at].present? ? Time.zone.parse(params[:action_at].to_s) : Time.current
        approval = find_or_initialize_requirement_approval(bid_package, spec_item.id, requirement_key)
        return if performed?
        approval.status = :pending
        approval.approved_at = nil
        approval.approved_by = nil
        append_action_history(approval, action: action_type, at: action_at)
        approval.save!

        render json: {
          status: 'pending',
          unapproved: true,
          spec_item_id: spec_item.id,
          requirement_key: requirement_key,
          component_id: approval.component_id
        }
      rescue StandardError => e
        render_award_exception(e)
      end

      def clear_current_award_approvals
        bid_package = BidPackage.find(params[:id])
        return render json: { errors: ['Bid package is not awarded'] }, status: :conflict unless bid_package.awarded?

        deleted_count = bid_package.spec_item_requirement_approvals.where(bid_id: bid_package.awarded_bid_id).delete_all
        render json: { cleared: true, deleted_count: deleted_count, bid_id: bid_package.awarded_bid_id }
      rescue StandardError => e
        render_award_exception(e)
      end

      def download_post_award_upload
        bid_package = BidPackage.find(params[:id])
        upload = bid_package.post_award_uploads.find(params[:upload_id])
        return render json: { error: 'Uploaded file not found' }, status: :not_found unless upload.file_available?

        send_file upload.stored_file_path,
                  filename: upload.file_name,
                  type: upload.content_type.presence || 'application/octet-stream',
                  disposition: 'attachment'
      end

      def preview_post_award_upload
        bid_package = BidPackage.find(params[:id])
        upload = bid_package.post_award_uploads.find(params[:upload_id])
        return render json: { error: 'Uploaded file not found' }, status: :not_found unless upload.file_available?

        send_file upload.stored_file_path,
                  filename: upload.file_name,
                  type: upload.content_type.presence || 'application/octet-stream',
                  disposition: 'inline'
      end

      def download_post_award_uploads_bundle
        bid_package = BidPackage.find(params[:id])
        upload_ids = parse_upload_ids(params[:upload_ids])
        uploads_scope = bid_package.post_award_uploads
        uploads_scope = uploads_scope.where(id: upload_ids) if upload_ids.any?
        uploads = uploads_scope.order(created_at: :desc).to_a.select(&:file_available?)
        return render json: { error: 'No files available to download' }, status: :not_found if uploads.empty?

        include_tag = ActiveModel::Type::Boolean.new.cast(params[:include_tag])
        include_code = ActiveModel::Type::Boolean.new.cast(params[:include_code])
        requirement_labels = build_requirement_labels_for_bundle(bid_package, uploads)
        spec_codes = build_spec_codes_for_bundle(bid_package, uploads)

        temp_file = Tempfile.new(["post-award-files-#{bid_package.id}-", '.zip'])
        begin
          entry_names = {}
          Zip::File.open(temp_file.path, Zip::File::CREATE) do |zip|
            uploads.each do |upload|
              requested_name = upload.file_name.presence || "file-#{upload.id}"
              final_name = build_bundle_filename(
                file_name: requested_name,
                code_tag: spec_codes[upload.spec_item_id],
                requirement_label: requirement_labels[upload.requirement_key],
                include_requirement_tag: include_tag,
                include_code_tag: include_code
              )
              unique_name = unique_zip_entry_name(final_name, entry_names)
              zip.add(unique_name, upload.stored_file_path.to_s)
            end
          end

          send_file temp_file.path,
                    filename: "line-item-files-#{bid_package.id}-#{Time.current.strftime('%Y%m%d-%H%M%S')}.zip",
                    type: 'application/zip',
                    disposition: 'attachment'
        ensure
          temp_file.close!
        end
      end

      def create_post_award_upload
        bid_package = BidPackage.find(params[:id])

        spec_item = nil
        spec_item_id = params[:spec_item_id].presence
        spec_item = bid_package.spec_items.find(spec_item_id) if spec_item_id.present?
        requirement_key = validated_upload_requirement_key(spec_item)
        return if performed?

        uploaded_file = params[:file]
        upload_attrs = {
          spec_item: spec_item,
          uploader_role: :designer,
          file_name: uploaded_file&.original_filename.presence || params.require(:file_name),
          note: params[:note],
          requirement_key: requirement_key
        }
        if requirement_key.blank? && ActiveModel::Type::Boolean.new.cast(params[:is_substitution])
          upload_attrs[:requirement_key] = PostAwardUpload::SUBSTITUTION_ROW_REQUIREMENT_KEY
        end
        if PostAwardUpload.supports_substitution_flag?
          upload_attrs[:is_substitution] = ActiveModel::Type::Boolean.new.cast(params[:is_substitution])
        end
        upload = bid_package.post_award_uploads.create!(upload_attrs)
        upload.persist_uploaded_file!(uploaded_file) if uploaded_file.present?

        render json: {
          uploaded: true,
          upload: serialize_post_award_upload(upload, bid_package)
        }, status: :created
      rescue StandardError => e
        render json: { errors: [e.message] }, status: :unprocessable_entity
      end

      def update_post_award_upload
        bid_package = BidPackage.find(params[:id])
        upload = bid_package.post_award_uploads.find(params[:upload_id])
        spec_item = upload.spec_item
        requirement_key = validated_upload_requirement_key(spec_item, params[:requirement_key], allow_blank: true)
        return if performed?

        upload.update!(requirement_key: requirement_key)
        render json: {
          updated: true,
          upload: serialize_post_award_upload(upload, bid_package)
        }
      rescue StandardError => e
        render json: { errors: [e.message] }, status: :unprocessable_entity
      end

      def delete_post_award_upload
        bid_package = BidPackage.find(params[:id])
        upload = bid_package.post_award_uploads.find(params[:upload_id])
        return render json: { error: 'Only designer uploads can be deleted from this view' }, status: :forbidden if upload.vendor?

        file_path = upload.file_available? ? upload.stored_file_path.to_s : nil
        upload.destroy!
        File.delete(file_path) if file_path.present? && File.exist?(file_path)

        render json: { deleted: true, upload_id: upload.id }
      rescue StandardError => e
        render json: { errors: [e.message] }, status: :unprocessable_entity
      end

      private

      def package_settings_params
        params.permit(:visibility, :instructions, active_general_fields: [], custom_questions: [:id, :label])
      end

      def update_params
        params.permit(:name, :visibility, :instructions, active_general_fields: [], excluded_spec_item_ids: [], custom_questions: [:id, :label])
      end

      def normalized_spec_item_ids(value)
        Array(value)
          .flat_map { |id| String(id).split(',') }
          .map { |id| id.to_i }
          .select(&:positive?)
          .uniq
      end

      def serialize_bid_package(bid_package)
        spec_items = bid_package.association(:spec_items).loaded? ? bid_package.spec_items : bid_package.spec_items.to_a
        active_spec_item_count = spec_items.count(&:active?)
        invite_count = bid_package.association(:invites).loaded? ? bid_package.invites.size : bid_package.invites.count
        awarded_dealer_name = bid_package.awarded_bid&.invite&.dealer_name

        {
          id: bid_package.id,
          name: bid_package.name,
          project_id: bid_package.project_id,
          project_name: bid_package.project&.name,
          created_at: bid_package.created_at,
          imported_at: bid_package.imported_at,
          spec_item_count: active_spec_item_count,
          invite_count: invite_count,
          awarded_dealer_name: awarded_dealer_name,
          visibility: bid_package.visibility,
          instructions: bid_package.instructions,
          active_general_fields: bid_package.active_general_fields,
          custom_questions: bid_package.custom_questions,
          excluded_spec_item_ids: bid_package.excluded_spec_item_ids,
          awarded_bid_id: bid_package.awarded_bid_id,
          awarded_at: bid_package.awarded_at,
          package_award_status: bid_package.package_award_status,
          awarded_row_count: bid_package.awarded_row_count,
          eligible_row_count: bid_package.eligible_award_row_count,
          award_winner_scope: bid_package.award_winner_scope,
          public_url: bid_package.visibility_public? ? "/public/bid-packages/#{bid_package.public_token}" : nil
        }
      end

      def render_row_award_success(result)
        render json: {
          awarded: true,
          bid_package_id: result.bid_package.id,
          awarded_bid_id: result.bid_package.awarded_bid_id,
          awarded_at: result.bid_package.awarded_at,
          package_award_status: result.bid_package.package_award_status,
          awarded_row_count: result.bid_package.awarded_row_count,
          eligible_row_count: result.bid_package.eligible_award_row_count,
          award_winner_scope: result.bid_package.award_winner_scope
        }
      end

      def render_award_failure(result)
        status = case result.error_key
                 when :already_awarded, :same_bid, :no_existing_award
                   :conflict
                 else
                   :unprocessable_entity
                 end

        render json: { errors: result.errors }, status: status
      end

      def awarding_user_name
        params[:awarded_by].presence || request.headers['X-Designer-User'].presence || 'Unknown'
      end

      def comparison_snapshot_params
        {
          excluded_spec_item_ids: normalized_spec_item_ids(params[:excluded_spec_item_ids]),
          cell_price_mode: params[:cell_price_mode].is_a?(ActionController::Parameters) ? params[:cell_price_mode].to_unsafe_h : {}
        }
      end

      def row_award_selections_params
        params.require(:selections).map do |selection|
          selection.permit(
            :spec_item_id,
            :bid_id,
            :price_source,
            :unit_price_snapshot,
            :extended_price_snapshot
          )
        end
      end

      def ensure_not_awarded!
        bid_package = BidPackage.find(params[:id])
        return unless bid_package.award_committed?

        render json: { error: 'Bid package is awarded and locked for bid package edits' }, status: :conflict
      end

      def build_bulk_row_award_selections(bid_package, bid, snapshot)
        excluded_ids = Array(snapshot[:excluded_spec_item_ids]).map(&:to_i).uniq
        price_mode_map = snapshot[:cell_price_mode].is_a?(Hash) ? snapshot[:cell_price_mode] : {}

        bid_package.spec_items.active.where.not(id: excluded_ids).map do |spec_item|
          selected_line = select_award_line_item(
            bid,
            spec_item.id,
            resolve_row_price_source(price_mode_map, spec_item.id, bid.invite_id)
          )
          next unless selected_line.present? && selected_line.unit_net_price.present?

          {
            spec_item_id: spec_item.id,
            bid_id: bid.id,
            price_source: selected_line.is_substitution? ? 'alt' : 'bod',
            unit_price_snapshot: selected_line.unit_net_price,
            extended_price_snapshot: begin
              quantity = selected_line.quantity.presence || spec_item.quantity
              quantity.present? ? (selected_line.unit_net_price * quantity.to_d).round(2) : nil
            end
          }
        end.compact
      end

      def resolve_row_price_source(price_mode_map, spec_item_id, invite_id)
        by_spec_item = price_mode_map[spec_item_id.to_s] || price_mode_map[spec_item_id.to_i]
        return 'bod' unless by_spec_item.respond_to?(:[])

        mode = by_spec_item[invite_id.to_s] || by_spec_item[invite_id.to_i]
        mode == 'alt' ? 'alt' : 'bod'
      end

      def select_award_line_item(bid, spec_item_id, preferred_mode)
        lines = bid.bid_line_items.select { |line| line.spec_item_id == spec_item_id }
        basis_line = lines.find { |line| !line.is_substitution? && line.unit_price.present? }
        substitution_line = lines.find { |line| line.is_substitution? && line.unit_price.present? }

        return substitution_line if preferred_mode == 'alt' && substitution_line.present?
        return basis_line if preferred_mode == 'bod' && basis_line.present?

        basis_line || substitution_line
      end

      def render_award_exception(error)
        status = case error
                 when ActionController::ParameterMissing, ActiveRecord::RecordInvalid, ArgumentError
                   :unprocessable_entity
                 else
                   :internal_server_error
                 end

        Rails.logger.error("[Award] #{error.class}: #{error.message}")
        render json: { errors: [error.message] }, status: status
      end

      def load_valid_requirement!(bid_package)
        spec_item = bid_package.spec_items.find(params[:spec_item_id])
        requirement_key = params.require(:requirement_key).to_s
        allowed_keys = PostAward::RequiredApprovalsService.requirements_for_spec_item(spec_item).map { |req| req[:key] }
        unless allowed_keys.include?(requirement_key)
          render json: { errors: ['Requirement does not apply to this line item'] }, status: :unprocessable_entity
          return
        end

        [spec_item, requirement_key]
      end

      def load_requirement_component!(spec_item)
        component_id = params[:component_id].presence || params[:approval_component_id].presence || params[:component]&.[](:id)
        return nil if component_id.blank?

        spec_item.spec_item_approval_components.find(component_id)
      rescue ActiveRecord::RecordNotFound
        render json: { errors: ['Approval component not found for this line item'] }, status: :unprocessable_entity
        nil
      end

      def find_or_initialize_requirement_approval(bid_package, spec_item_id, requirement_key, component_id: :auto, allow_parent_when_components_active: false)
        resolved_component_id = if component_id == :auto
          resolved_component = load_requirement_component!(bid_package.spec_items.find(spec_item_id))
          return if performed?

          resolved_component&.id
        else
          component_id
        end

        if resolved_component_id.blank? && !allow_parent_when_components_active
          component_scope = bid_package.spec_item_requirement_approvals.where(
            spec_item_id: spec_item_id,
            requirement_key: requirement_key,
            bid_id: bid_package.awarded_bid_id
          ).where.not(component_id: nil)
          if component_scope.exists?
            render json: { errors: ['This requirement is managed by sub-rows for this column'] }, status: :unprocessable_entity
            return
          end
        end

        bid_package.spec_item_requirement_approvals.find_or_initialize_by(
          spec_item_id: spec_item_id,
          requirement_key: requirement_key,
          bid_id: bid_package.awarded_bid_id,
          component_id: resolved_component_id
        )
      end

      def clear_parent_requirement_approval!(bid_package, spec_item_id, requirement_key)
        bid_package.spec_item_requirement_approvals.where(
          spec_item_id: spec_item_id,
          requirement_key: requirement_key,
          bid_id: bid_package.awarded_bid_id,
          component_id: nil
        ).delete_all
      end

      def append_action_history(approval, action:, at:)
        history = approval.action_history_array
        history << {
          action: action,
          at: at.iso8601
        }
        approval.action_history = history
      end

      def next_component_position(spec_item)
        spec_item.spec_item_approval_components.maximum(:position).to_i + 1
      end

      def next_component_label(spec_item)
        "Component #{spec_item.spec_item_approval_components.count + 1}"
      end

      def serialize_spec_item_component(component, spec_item)
        bid_id = component.bid_package.awarded_bid_id
        {
          id: component.id,
          label: component.label,
          position: component.position,
          required_approvals: PostAward::RequiredApprovalsService.requirements_for_spec_item(spec_item).map do |req|
            serialize_requirement_for_dashboard(spec_item, req[:key], bid_id, component: component)
          end
        }
      end

      def serialize_requirement_for_dashboard(spec_item, requirement_key, bid_id, component: nil)
        allowed_requirements = PostAward::RequiredApprovalsService.requirements_for_spec_item(spec_item)
        requirement_meta = allowed_requirements.find { |req| req[:key] == requirement_key }
        applies = requirement_meta.present?
        approvals_scope = spec_item.bid_package.spec_item_requirement_approvals.where(
          spec_item_id: spec_item.id,
          requirement_key: requirement_key,
          bid_id: bid_id
        )

        if component.present?
          approval = approvals_scope.find_by(component_id: component.id)
          return build_requirement_payload(requirement_meta, applies, approval, ownership: approval.present? ? 'component' : 'inactive')
        end

        component_approvals = approvals_scope.where.not(component_id: nil).includes(:component).to_a
        if component_approvals.any?
          derived_status = component_approvals.all?(&:approved?) ? 'approved' : 'incomplete'
          latest_approved_at = component_approvals.map(&:approved_at).compact.max
          return {
            key: requirement_key,
            label: requirement_meta&.dig(:label) || requirement_key.to_s.humanize,
            applies: applies,
            status: derived_status,
            approved: derived_status == 'approved',
            approved_at: latest_approved_at,
            approved_by: nil,
            needs_fix_dates: [],
            ownership: 'components',
            activated_sub_rows_count: component_approvals.length
          }
        end

        approval = approvals_scope.find_by(component_id: nil)
        build_requirement_payload(requirement_meta, applies, approval, ownership: 'parent')
      end

      def build_requirement_payload(requirement_meta, applies, approval, ownership:)
        status = if ownership == 'inactive'
          'inactive'
        elsif applies
          approval&.status || 'pending'
        else
          'pending'
        end

        {
          key: requirement_meta&.dig(:key) || approval&.requirement_key,
          label: requirement_meta&.dig(:label) || approval&.requirement_key.to_s.humanize,
          applies: applies,
          status: status,
          approved: applies && status == 'approved',
          approved_at: approval&.approved_at,
          approved_by: approval&.approved_by,
          needs_fix_dates: approval&.needs_fix_dates_array || [],
          ownership: ownership,
          component_id: approval&.component_id
        }
      end

      def serialize_post_award_upload(upload, bid_package)
        {
          id: upload.id,
          file_name: upload.file_name,
          note: upload.note,
          requirement_key: upload.api_requirement_key,
          is_substitution: upload.substitution_upload?,
          byte_size: upload.byte_size,
          uploader_role: upload.uploader_role,
          uploaded_by: upload.invite&.dealer_name || upload.uploader_role.to_s.titleize,
          uploaded_at: upload.created_at,
          spec_item_id: upload.spec_item_id,
          download_url: upload.file_available? ? "/api/bid_packages/#{bid_package.id}/post_award_uploads/#{upload.id}/download" : nil
        }
      end

      def validated_upload_requirement_key(spec_item, raw_value = nil, allow_blank: false)
        raw = raw_value.nil? ? params[:requirement_key] : raw_value
        raw = raw.presence
        return nil if raw.blank? && allow_blank
        return nil if raw.blank?
        return nil unless spec_item

        key = raw.to_s
        allowed_keys = PostAward::RequiredApprovalsService.requirements_for_spec_item(spec_item).map { |req| req[:key] }
        return key if allowed_keys.include?(key)

        render json: { errors: ['Requirement tag does not apply to this line item'] }, status: :unprocessable_entity
        nil
      end

      def parse_upload_ids(value)
        Array(value)
          .flat_map { |item| item.to_s.split(',') }
          .map(&:strip)
          .reject(&:blank?)
          .map(&:to_i)
          .uniq
      end

      def build_requirement_labels_for_bundle(bid_package, uploads)
        spec_item_ids = uploads.map(&:spec_item_id).compact.uniq
        return {} if spec_item_ids.empty?

        specs_by_id = bid_package.spec_items.where(id: spec_item_ids).index_by(&:id)
        labels = {}
        uploads.each do |upload|
          next if upload.requirement_key.blank?
          next if labels.key?(upload.requirement_key)

          spec_item = specs_by_id[upload.spec_item_id]
          requirement = spec_item && PostAward::RequiredApprovalsService
            .requirements_for_spec_item(spec_item)
            .find { |row| row[:key] == upload.requirement_key }
          labels[upload.requirement_key] = requirement&.dig(:label) || upload.requirement_key.to_s.humanize
        end
        labels
      end

      def build_spec_codes_for_bundle(bid_package, uploads)
        spec_item_ids = uploads.map(&:spec_item_id).compact.uniq
        return {} if spec_item_ids.empty?

        bid_package.spec_items.where(id: spec_item_ids).pluck(:id, :sku).to_h
      end

      def build_bundle_filename(file_name:, code_tag:, requirement_label:, include_requirement_tag:, include_code_tag:)
        base_name = file_name.to_s
        dot = base_name.rindex('.')
        stem = (dot && dot.positive?) ? base_name[0...dot] : base_name
        ext = (dot && dot.positive?) ? base_name[dot..-1] : ''

        code = include_code_tag ? normalize_download_token(code_tag) : ''
        requirement = include_requirement_tag ? normalize_download_token(requirement_label) : ''
        parts = [code, requirement, stem].reject(&:blank?)
        return base_name if parts.empty?

        "#{parts.join('_')}#{ext}"
      end

      def normalize_download_token(value)
        value.to_s.strip.gsub(/[^a-zA-Z0-9-]+/, '_').gsub(/^_+|_+$/, '')
      end

      def unique_zip_entry_name(name, taken_names)
        base = name
        ext = ''
        if (dot = name.rindex('.')) && dot.positive?
          base = name[0...dot]
          ext = name[dot..-1]
        end

        candidate = name
        counter = 2
        while taken_names[candidate]
          candidate = "#{base} (#{counter})#{ext}"
          counter += 1
        end
        taken_names[candidate] = true
        candidate
      end
    end
  end
end
