module Api
  module Admin
    class DashboardsController < Api::BaseController
      def show
        bid_package = BidPackage.includes(
          :bid_award_events,
          :bid_row_awards,
          :spec_item_approval_components,
          :spec_item_requirement_approvals,
          :post_award_uploads,
          invites: { bid: [:bid_submission_versions, :bid_line_items] }
        ).find(params[:bid_package_id])
        excluded_spec_item_ids = bid_package.excluded_spec_item_ids
        active_spec_items = bid_package.spec_items.active.where.not(id: excluded_spec_item_ids).select(:id, :quantity)
        active_spec_item_ids = active_spec_items.map(&:id)
        active_spec_item_id_set = active_spec_item_ids.each_with_object({}) do |id, memo|
          memo[id] = true
        end
        active_spec_quantities = active_spec_items.each_with_object({}) do |item, memo|
          memo[item.id] = item.quantity
        end
        total_requested = active_spec_item_ids.length
        bid_row_awards_scope = bid_package.bid_row_awards.joins(:spec_item).merge(bid_package.spec_items.active)
        bid_row_awards_scope = bid_row_awards_scope.where.not(spec_item_id: excluded_spec_item_ids) if excluded_spec_item_ids.any?
        bid_row_awards = bid_row_awards_scope.to_a
        bid_row_awards_by_spec_item_id = bid_row_awards.index_by(&:spec_item_id)
        total_awarded_rows = bid_row_awards.length
        eligible_award_row_count = active_spec_item_ids.length
        awarded_rows_by_bid_id = bid_row_awards.each_with_object(Hash.new(0)) do |award, memo|
          memo[award.bid_id] += 1 if award.bid_id.present?
        end
        awarded_amounts_by_bid_id = bid_row_awards.each_with_object(Hash.new(0.to_d)) do |award, memo|
          next unless award.bid_id.present?

          memo[award.bid_id] += award.extended_price_snapshot.to_d
        end

        current_awarded_bid_id = bid_package.awarded_bid_id
        current_award_snapshot = if current_awarded_bid_id.present?
          bid_package
            .bid_award_events
            .where(to_bid_id: current_awarded_bid_id, event_type: %w[award reassign])
            .order(awarded_at: :desc, id: :desc)
            .limit(1)
            .first
            &.awarded_amount_snapshot
        end

        rows = bid_package.invites.map do |invite|
          bid = invite.bid
          latest_version = bid&.bid_submission_versions&.maximum(:version_number) || 0
          latest_total_amount = bid&.bid_submission_versions&.order(version_number: :desc)&.first&.total_amount
          total_range = total_range_for_bid(bid, active_spec_quantities)
          quote_summary = quote_summary_for_bid(bid, active_spec_item_id_set, total_requested)
          awarded_row_count = bid&.id.present? ? awarded_rows_by_bid_id[bid.id].to_i : 0
          has_awarded_rows = awarded_row_count.positive?
          winner_status = if awarded_row_count.zero?
            nil
          elsif eligible_award_row_count.positive? && awarded_row_count == eligible_award_row_count
            'sole_winner'
          else
            'partial_winner'
          end

          {
            invite_id: invite.id,
            bid_id: bid&.id,
            dealer_name: invite.dealer_name,
            dealer_email: invite.dealer_email,
            invite_password: invite.password_plaintext,
            status: dashboard_status_for(bid),
            selection_status: bid&.selection_status || 'pending',
            access_state: invite.disabled? ? 'disabled' : 'enabled',
            current_version: latest_version,
            can_reclose: bid.present? && !bid.submitted? && latest_version.positive?,
            can_reopen: bid.present? && bid.submitted? && !has_awarded_rows,
            reopen_block_reason: has_awarded_rows ? 'Cannot reopen this bidder because they have awarded rows. Reassign or clear those awards first.' : nil,
            awarded_row_count: awarded_row_count,
            awarded_total_amount: awarded_amounts_by_bid_id[bid&.id].to_d,
            winner_status: winner_status,
            latest_total_amount: latest_total_amount,
            min_total_amount: total_range[:min_total],
            max_total_amount: total_range[:max_total],
            awarded_amount_snapshot: (bid&.id == current_awarded_bid_id ? current_award_snapshot : nil),
            total_requested_count: quote_summary[:total_requested],
            quoted_count: quote_summary[:quoted],
            bod_only_count: quote_summary[:bod_only],
            mixed_line_count: quote_summary[:mixed],
            sub_only_count: quote_summary[:sub_only],
            completion_pct: quote_summary[:completion_pct],
            bod_skipped_pct: quote_summary[:bod_skipped_pct],
            custom_question_responses: bid&.custom_question_responses || {},
            last_saved_at: bid&.updated_at,
            submitted_at: bid&.submitted_at,
            last_reopened_at: bid&.last_reopened_at,
            invite_url: "/invite/#{invite.token}"
          }
        end

        all_requirement_columns = PostAward::RequiredApprovalsService::REQUIREMENTS
        awarded_approvals = bid_package.spec_item_requirement_approvals
                                       .select { |approval| approval.bid_id == current_awarded_bid_id }
        approvals_by_spec_item_id = awarded_approvals.group_by(&:spec_item_id)
        uploads_by_spec_item_id = bid_package.post_award_uploads
                                             .select(&:spec_item_id)
                                             .group_by(&:spec_item_id)
        components_by_spec_item_id = bid_package.spec_item_approval_components.group_by(&:spec_item_id)
        general_uploads = bid_package.post_award_uploads
                                     .reject(&:spec_item_id)
                                     .sort_by(&:created_at)
                                     .reverse
        spec_items_scope = bid_package.spec_items
        spec_items_scope = spec_items_scope.where.not(id: excluded_spec_item_ids) if excluded_spec_item_ids.any?

        render json: {
          bid_package_id: bid_package.id,
          bid_package: {
            id: bid_package.id,
            name: bid_package.name,
            visibility: bid_package.visibility,
            instructions: bid_package.instructions,
            active_general_fields: bid_package.active_general_fields,
            custom_questions: bid_package.custom_questions,
            excluded_spec_item_ids: excluded_spec_item_ids,
            awarded_bid_id: bid_package.awarded_bid_id,
            awarded_at: bid_package.awarded_at,
            package_award_status: bid_package.package_award_status,
            awarded_row_count: bid_package.awarded_row_count,
            eligible_row_count: bid_package.eligible_award_row_count,
            award_winner_scope: bid_package.award_winner_scope,
            public_url: bid_package.visibility_public? ? "/public/bid-packages/#{bid_package.public_token}" : nil
          },
          required_approval_columns: all_requirement_columns,
          current_awarded_bid_id: current_awarded_bid_id,
          spec_items: spec_items_scope
                                 .order(:id)
                                 .map do |item|
            item_requirement_keys = PostAward::RequiredApprovalsService
                                    .requirements_for_spec_item(item)
                                    .map { |req| req[:key] }
            approvals_for_item = Array(approvals_by_spec_item_id[item.id])
            parent_approvals_by_key = approvals_for_item.select { |approval| approval.component_id.nil? }.index_by(&:requirement_key)
            component_approvals_by_component = approvals_for_item
                                              .reject { |approval| approval.component_id.nil? }
                                              .group_by(&:component_id)
            uploads = Array(uploads_by_spec_item_id[item.id]).sort_by(&:created_at).reverse
            components = Array(components_by_spec_item_id[item.id]).sort_by { |component| [component.position, component.id] }
            row_award = bid_row_awards_by_spec_item_id[item.id]
            {
              id: item.id,
              active: item.active?,
              code_tag: item.sku,
              product_name: item.product_name,
              brand_name: item.manufacturer,
              quantity: item.quantity,
              uom: item.uom,
              awarded_bid_id: row_award&.bid_id,
              awarded_invite_id: row_award&.bid&.invite_id,
              required_approvals: all_requirement_columns.map do |req|
                applies = item_requirement_keys.include?(req[:key])
                component_approvals = approvals_for_item.select { |approval| approval.requirement_key == req[:key] && approval.component_id.present? }
                if component_approvals.any?
                  {
                    key: req[:key],
                    label: req[:label],
                    applies: applies,
                    status: component_approvals.all?(&:approved?) ? 'approved' : 'incomplete',
                    approved: component_approvals.all?(&:approved?),
                    approved_at: component_approvals.map(&:approved_at).compact.max,
                    approved_by: nil,
                    needs_fix_dates: [],
                    ownership: 'components',
                    activated_sub_rows_count: component_approvals.length
                  }
                else
                  approval = parent_approvals_by_key[req[:key]]
                  status = if applies
                    approval&.status || 'pending'
                  else
                    'pending'
                  end
                  {
                    key: req[:key],
                    label: req[:label],
                    applies: applies,
                    status: status,
                    approved: applies && status == 'approved',
                    approved_at: approval&.approved_at,
                    approved_by: approval&.approved_by,
                    needs_fix_dates: approval&.needs_fix_dates_array || [],
                    ownership: 'parent',
                    activated_sub_rows_count: 0
                  }
                end
              end,
              approval_components: components.map do |component|
                {
                  id: component.id,
                  label: component.label,
                  position: component.position,
                  required_approvals: all_requirement_columns.map do |req|
                    applies = item_requirement_keys.include?(req[:key])
                    approval = Array(component_approvals_by_component[component.id]).find { |entry| entry.requirement_key == req[:key] }
                    status = if approval.present?
                      approval.status
                    else
                      'inactive'
                    end
                    {
                      key: req[:key],
                      label: req[:label],
                      applies: applies,
                      status: status,
                      approved: applies && status == 'approved',
                      approved_at: approval&.approved_at,
                      approved_by: approval&.approved_by,
                      needs_fix_dates: approval&.needs_fix_dates_array || [],
                      ownership: approval.present? ? 'component' : 'inactive',
                      component_id: component.id
                    }
                  end
                }
              end,
              uploads: uploads.map do |upload|
                {
                  id: upload.id,
                  file_name: upload.file_name,
                  download_url: upload.file_available? ? "/api/bid_packages/#{bid_package.id}/post_award_uploads/#{upload.id}/download" : nil,
                  note: upload.note,
                  requirement_key: upload.api_requirement_key,
                  is_substitution: upload.substitution_upload?,
                  byte_size: upload.byte_size,
                  uploader_role: upload.uploader_role,
                  uploaded_by: upload.invite&.dealer_name || upload.uploader_role.to_s.titleize,
                  uploaded_at: upload.created_at
                }
              end
            }
          end,
          general_uploads: general_uploads.map do |upload|
            {
              id: upload.id,
              file_name: upload.file_name,
              download_url: upload.file_available? ? "/api/bid_packages/#{bid_package.id}/post_award_uploads/#{upload.id}/download" : nil,
              note: upload.note,
              requirement_key: upload.api_requirement_key,
              is_substitution: upload.substitution_upload?,
              byte_size: upload.byte_size,
              uploader_role: upload.uploader_role,
              uploaded_by: upload.invite&.dealer_name || upload.uploader_role.to_s.titleize,
              uploaded_at: upload.created_at
            }
          end,
          invites: rows
        }
      end

      private

      def quote_summary_for_bid(bid, active_spec_item_ids, total_requested)
        return zero_quote_summary(total_requested) unless bid
        return zero_quote_summary(total_requested) if active_spec_item_ids.empty?

        by_spec_item = Hash.new { |h, k| h[k] = { bod: false, sub: false } }

        bid.bid_line_items.each do |line_item|
          spec_item_id = line_item.spec_item_id
          next unless active_spec_item_ids.include?(spec_item_id)
          next if line_item.unit_price.blank?

          if line_item.is_substitution?
            by_spec_item[spec_item_id][:sub] = true
          else
            by_spec_item[spec_item_id][:bod] = true
          end
        end

        bod_only = 0
        mixed = 0
        sub_only = 0

        by_spec_item.each_value do |flags|
          if flags[:bod] && flags[:sub]
            mixed += 1
          elsif flags[:bod]
            bod_only += 1
          elsif flags[:sub]
            sub_only += 1
          end
        end

        quoted = bod_only + mixed + sub_only
        rows_with_bod = bod_only + mixed
        bod_skipped_count = [total_requested - rows_with_bod, 0].max
        completion_pct = total_requested.positive? ? ((quoted.to_f / total_requested) * 100.0) : 0.0
        bod_skipped_pct = total_requested.positive? ? ((bod_skipped_count.to_f / total_requested) * 100.0) : 0.0

        {
          total_requested: total_requested,
          quoted: quoted,
          bod_only: bod_only,
          mixed: mixed,
          sub_only: sub_only,
          completion_pct: completion_pct.round(1),
          bod_skipped_pct: bod_skipped_pct.round(1)
        }
      end

      def zero_quote_summary(total_requested)
        {
          total_requested: total_requested,
          quoted: 0,
          bod_only: 0,
          mixed: 0,
          sub_only: 0,
          completion_pct: 0.0,
          bod_skipped_pct: 0.0
        }
      end

      def dashboard_status_for(bid)
        return 'not_started' unless bid
        return 'submitted' if bid.submitted?

        'in_progress'
      end

      def total_range_for_bid(bid, active_spec_quantities)
        return { min_total: nil, max_total: nil } unless bid
        return { min_total: nil, max_total: nil } if active_spec_quantities.empty?

        by_spec_item = Hash.new { |h, k| h[k] = { bod: nil, sub: nil, bod_qty: nil, sub_qty: nil } }

        bid.bid_line_items.each do |line_item|
          spec_item_id = line_item.spec_item_id
          next unless active_spec_quantities.key?(spec_item_id)
          next if line_item.unit_net_price.blank?

          if line_item.is_substitution?
            by_spec_item[spec_item_id][:sub] = line_item.unit_net_price.to_d
            by_spec_item[spec_item_id][:sub_qty] = line_item.quantity
          else
            by_spec_item[spec_item_id][:bod] = line_item.unit_net_price.to_d
            by_spec_item[spec_item_id][:bod_qty] = line_item.quantity
          end
        end

        min_subtotal = 0.to_d
        max_subtotal = 0.to_d
        priced_row_count = 0

        by_spec_item.each do |spec_item_id, prices|
          default_quantity = active_spec_quantities[spec_item_id]
          options = []
          if prices[:bod].present?
            bod_quantity = prices[:bod_qty].presence || default_quantity
            options << (prices[:bod] * bod_quantity.to_d) if bod_quantity.present?
          end
          if prices[:sub].present?
            sub_quantity = prices[:sub_qty].presence || default_quantity
            options << (prices[:sub] * sub_quantity.to_d) if sub_quantity.present?
          end
          next if options.empty?

          min_subtotal += options.min
          max_subtotal += options.max
          priced_row_count += 1
        end

        return { min_total: nil, max_total: nil } if priced_row_count.zero?

        {
          min_total: min_subtotal + bid.active_general_pricing_total(subtotal: min_subtotal),
          max_total: max_subtotal + bid.active_general_pricing_total(subtotal: max_subtotal)
        }
      end

      def latest_award_comparison_snapshot_for(bid_package)
        event = bid_package.bid_award_events
                           .where(event_type: [BidAwardEvent.event_types[:award], BidAwardEvent.event_types[:reaward]])
                           .order(awarded_at: :desc, id: :desc)
                           .first
        event&.comparison_snapshot.is_a?(Hash) ? event.comparison_snapshot : {}
      end
    end
  end
end
