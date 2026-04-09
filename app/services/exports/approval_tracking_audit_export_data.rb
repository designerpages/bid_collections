module Exports
  class ApprovalTrackingAuditExportData
    ACTION_LABELS = {
      'approved' => 'Approved',
      'needs_fix' => 'Needs Fix',
      'reset' => 'Reset',
      'unapproved' => 'Unapproved'
    }.freeze

    def initialize(bid_package:)
      @bid_package = bid_package
      @requirement_labels = PostAward::RequiredApprovalsService::REQUIREMENTS.each_with_object({}) do |req, memo|
        memo[req[:key]] = req[:label]
      end
    end

    def call
      awarded_bid_id = @bid_package.awarded_bid_id
      approvals = @bid_package.spec_item_requirement_approvals.where(bid_id: awarded_bid_id)
      items_by_id = @bid_package.spec_items.index_by(&:id)

      rows = approvals.flat_map do |approval|
        item = items_by_id[approval.spec_item_id]
        next [] unless item

        audit_events_for(approval).map do |event|
          event_time = parse_time_or_nil(event[:at])
          component_label = approval.component&.label
          requirement_label = @requirement_labels[approval.requirement_key] || approval.requirement_key
          requirement_label = "#{requirement_label} (#{component_label})" if component_label.present?
          {
            action_at: event_time,
            code_tag: item.sku,
            product_name: item.product_name,
            requirement: requirement_label,
            action: ACTION_LABELS[event[:action].to_s] || event[:action].to_s.humanize
          }
        end
      end

      sorted_rows = rows.sort_by { |row| row[:action_at] || Time.at(0) }.reverse

      {
        headers: ['Action Date', 'Code/Tag', 'Product', 'Requirement', 'Action'],
        rows: sorted_rows.map do |row|
          [
            row[:action_at]&.strftime('%Y-%m-%d %H:%M:%S'),
            row[:code_tag],
            row[:product_name],
            row[:requirement],
            row[:action]
          ]
        end
      }
    end

    private

    def audit_events_for(approval)
      history = approval.action_history_array
      return history.map { |event| normalize_event(event) } if history.any?

      # Backward-compatible fallback for records created before action history existed.
      fallback = []
      approval.needs_fix_dates_array.each do |stamp|
        fallback << { action: 'needs_fix', at: stamp }
      end
      fallback << { action: 'approved', at: approval.approved_at } if approval.approved_at.present?
      fallback
    end

    def normalize_event(event)
      {
        action: event['action'] || event[:action],
        at: event['at'] || event[:at]
      }
    end

    def parse_time_or_nil(value)
      return nil if value.blank?
      return value.to_time if value.respond_to?(:to_time)

      Time.zone.parse(value.to_s)
    rescue ArgumentError
      nil
    end
  end
end
