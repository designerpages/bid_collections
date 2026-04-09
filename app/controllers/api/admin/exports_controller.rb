module Api
  module Admin
    class ExportsController < Api::BaseController
      def show
        bid_package = BidPackage.find(params[:bid_package_id])
        price_modes = params[:price_mode].is_a?(ActionController::Parameters) ? params[:price_mode].to_unsafe_h : {}
        cell_price_modes = params[:cell_price_mode].is_a?(ActionController::Parameters) ? params[:cell_price_mode].to_unsafe_h : {}
        excluded_spec_item_ids = Array(params[:excluded_spec_item_ids]).map(&:to_i).uniq
        requested_format = params[:format].to_s.downcase
        export_type = params[:export_type].to_s.presence || 'comparison'
        comparison_mode = params[:comparison_mode].to_s.presence || 'average'
        show_product = ActiveModel::Type::Boolean.new.cast(params.fetch(:show_product, true))
        show_brand = ActiveModel::Type::Boolean.new.cast(params.fetch(:show_brand, true))
        show_unit_price = ActiveModel::Type::Boolean.new.cast(params.fetch(:show_unit_price, true))
        show_lead_time = ActiveModel::Type::Boolean.new.cast(params.fetch(:show_lead_time, false))
        show_notes = ActiveModel::Type::Boolean.new.cast(params.fetch(:show_notes, false))
        visible_dealer_invite_ids = Array(params[:visible_dealer_invite_ids]).map(&:to_s).reject(&:blank?)
        column_order = Array(params[:column_order]).map(&:to_s).reject(&:blank?)

        if export_type == 'approval_matrix'
          return send_approval_matrix_export(bid_package, requested_format)
        end
        if export_type == 'approval_audit'
          return send_approval_audit_export(bid_package, requested_format)
        end

        send_comparison_export(
          bid_package: bid_package,
          requested_format: requested_format,
          price_modes: price_modes,
          cell_price_modes: cell_price_modes,
          excluded_spec_item_ids: excluded_spec_item_ids,
          comparison_mode: comparison_mode,
          show_product: show_product,
          show_brand: show_brand,
          show_unit_price: show_unit_price,
          show_lead_time: show_lead_time,
          show_notes: show_notes,
          visible_dealer_invite_ids: visible_dealer_invite_ids,
          column_order: column_order
        )
      end

      private

      def send_approval_matrix_export(bid_package, requested_format)
        if requested_format == 'xlsx'
          output = Exports::ApprovalTrackingMatrixXlsxService.new(bid_package: bid_package).call
          send_data output,
                    filename: "bid_package_#{bid_package.id}_approval_matrix.xlsx",
                    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        else
          output = Exports::ApprovalTrackingMatrixCsvService.new(bid_package: bid_package).call
          send_data output,
                    filename: "bid_package_#{bid_package.id}_approval_matrix.csv",
                    type: 'text/csv; charset=utf-8'
        end
      end

      def send_approval_audit_export(bid_package, requested_format)
        if requested_format == 'xlsx'
          output = Exports::ApprovalTrackingAuditXlsxService.new(bid_package: bid_package).call
          send_data output,
                    filename: "bid_package_#{bid_package.id}_approval_audit.xlsx",
                    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        else
          output = Exports::ApprovalTrackingAuditCsvService.new(bid_package: bid_package).call
          send_data output,
                    filename: "bid_package_#{bid_package.id}_approval_audit.csv",
                    type: 'text/csv; charset=utf-8'
        end
      end

      def send_comparison_export(
        bid_package:,
        requested_format:,
        price_modes:,
        cell_price_modes:,
        excluded_spec_item_ids:,
        comparison_mode:,
        show_product:,
        show_brand:,
        show_unit_price:,
        show_lead_time:,
        show_notes:,
        visible_dealer_invite_ids:,
        column_order:
      )
        if requested_format == 'xlsx'
          output = Exports::BidPackageComparisonXlsxService.new(
            bid_package: bid_package,
            price_modes: price_modes,
            cell_price_modes: cell_price_modes,
            excluded_spec_item_ids: excluded_spec_item_ids,
            comparison_mode: comparison_mode,
            show_product: show_product,
            show_brand: show_brand,
            show_unit_price: show_unit_price,
            show_lead_time: show_lead_time,
            show_notes: show_notes,
            visible_dealer_invite_ids: visible_dealer_invite_ids,
            column_order: column_order
          ).call
          send_data output,
                    filename: "bid_package_#{bid_package.id}_comparison.xlsx",
                    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        else
          output = Exports::BidPackageComparisonCsvService.new(
            bid_package: bid_package,
            price_modes: price_modes,
            cell_price_modes: cell_price_modes,
            excluded_spec_item_ids: excluded_spec_item_ids,
            comparison_mode: comparison_mode,
            show_product: show_product,
            show_brand: show_brand,
            show_unit_price: show_unit_price,
            show_lead_time: show_lead_time,
            show_notes: show_notes,
            visible_dealer_invite_ids: visible_dealer_invite_ids,
            column_order: column_order
          ).call
          send_data output,
                    filename: "bid_package_#{bid_package.id}_comparison.csv",
                    type: 'text/csv; charset=utf-8'
        end
      end
    end
  end
end
