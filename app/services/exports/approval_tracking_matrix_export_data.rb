module Exports
  class ApprovalTrackingMatrixExportData
    def initialize(bid_package:)
      @bid_package = bid_package
      @requirement_columns = PostAward::RequiredApprovalsService::REQUIREMENTS
    end

    def call
      awarded_bid_id = @bid_package.awarded_bid_id
      approvals = @bid_package.spec_item_requirement_approvals.where(bid_id: awarded_bid_id)
      approvals_by_key = approvals.group_by { |approval| [approval.spec_item_id, approval.requirement_key] }

      headers = ['Code/Tag', 'Product', 'Brand', 'Qty/UOM'] + @requirement_columns.map { |req| req[:label] }
      rows = @bid_package.spec_items.order(:id).map do |item|
        requirement_keys = PostAward::RequiredApprovalsService.requirements_for_spec_item(item).map { |req| req[:key] }
        base = [item.sku, item.product_name, item.manufacturer, qty_uom(item.quantity, item.uom)]
        status_cells = @requirement_columns.map do |req|
          if requirement_keys.exclude?(req[:key])
            'N/A'
          else
            row_approvals = Array(approvals_by_key[[item.id, req[:key]]])
            matrix_status_value(row_approvals)
          end
        end

        base + status_cells
      end

      { headers: headers, rows: rows }
    end

    private

    def matrix_status_value(approvals)
      rows = Array(approvals)
      return 'Pending' if rows.empty?

      component_rows = rows.select { |approval| approval.component_id.present? }
      if component_rows.any?
        return component_rows.all?(&:approved?) ? 'Approved' : 'Incomplete'
      end

      approval = rows.find { |entry| entry.component_id.nil? }
      return 'Pending' unless approval.present?

      status = if approval.respond_to?(:status)
        approval.status.to_s
      else
        approval.approved_at.present? ? 'approved' : 'pending'
      end
      needs_fix_dates = approval.needs_fix_dates_array
      latest_needs_fix = parse_time_or_nil(needs_fix_dates.last)

      case status
      when 'approved'
        approved_at = parse_time_or_nil(approval.approved_at)
        approved_label = approved_at ? "Approved (#{approved_at.strftime('%Y-%m-%d')})" : 'Approved'
        if needs_fix_dates.length.positive?
          "#{approved_label} [Fixed #{needs_fix_dates.length}x]"
        else
          approved_label
        end
      when 'needs_revision'
        prefix = needs_fix_dates.length > 1 ? "Needs Fix (#{needs_fix_dates.length}x)" : 'Needs Fix'
        latest_needs_fix ? "#{prefix} (#{latest_needs_fix.strftime('%Y-%m-%d')})" : prefix
      else
        'Pending'
      end
    end

    def qty_uom(quantity, uom)
      qty = quantity.blank? ? '—' : quantity.to_s
      unit = uom.blank? ? '' : " #{uom}"
      "#{qty}#{unit}"
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
