module Comparison
  class BidPackageComparisonService
    def initialize(bid_package:, price_modes: {}, cell_price_modes: {}, excluded_spec_item_ids: [], include_inactive: false)
      @bid_package = bid_package
      @price_modes = price_modes || {}
      @cell_price_modes = cell_price_modes || {}
      @excluded_spec_item_ids = Array(excluded_spec_item_ids).map(&:to_i).uniq
      @include_inactive = include_inactive
    end

    def call
      submitted_bids = @bid_package.invites.includes(bid: :bid_line_items).map(&:bid).compact.select(&:submitted?)
      uploads_by_spec_and_invite = @bid_package.post_award_uploads.includes(:invite).each_with_object({}) do |upload, memo|
        next if upload.spec_item_id.blank? || upload.invite_id.blank?

        key = [upload.spec_item_id, upload.invite_id, upload.substitution_upload?]
        memo[key] ||= []
        memo[key] << serialize_upload(upload)
      end
      row_awards_by_spec_item_id = @bid_package.bid_row_awards.includes(bid: :invite).each_with_object({}) do |award, memo|
        memo[award.spec_item_id] = award
      end
      dealers = submitted_bids.map do |b|
        subtotal = active_subtotal_for_bid(b)
        pricing_amounts = b.general_pricing_amounts(subtotal: subtotal)
        {
          bid_id: b.id,
          invite_id: b.invite_id,
          dealer_name: b.invite.dealer_name,
          dealer_email: b.invite.dealer_email,
          selection_status: b.selection_status,
          awarded: @bid_package.awarded_bid_id == b.id,
          awarded_row_count: row_awards_by_spec_item_id.values.count { |award| award.bid_id == b.id },
          delivery_amount: pricing_amounts['delivery_amount'],
          install_amount: pricing_amounts['install_amount'],
          escalation_amount: pricing_amounts['escalation_amount'],
          contingency_amount: pricing_amounts['contingency_amount'],
          sales_tax_amount: pricing_amounts['sales_tax_amount'],
          delivery_percent: b.delivery_percent,
          install_percent: b.install_percent,
          escalation_percent: b.escalation_percent,
          contingency_percent: b.contingency_percent,
          sales_tax_percent: b.sales_tax_percent
        }
      end

      spec_items_scope = @bid_package.spec_items
      spec_items_scope = spec_items_scope.active unless @include_inactive

      rows = spec_items_scope
             .order(:id)
             .map do |spec_item|
        row_award = row_awards_by_spec_item_id[spec_item.id]
        line_prices = submitted_bids.map do |bid|
          selected_line_item_for_spec_item(
            bid,
            spec_item.id,
            preferred_mode_for(spec_item.id, bid.invite_id)
          )&.unit_net_price
        end.compact

        avg = line_prices.any? ? (line_prices.sum / line_prices.size).to_d.round(4) : nil

        dealer_cells = submitted_bids.map do |bid|
          details = line_item_details_for_spec_item(
            bid,
            spec_item.id,
            preferred_mode_for(spec_item.id, bid.invite_id)
          )
          price = details[:selected_line]&.unit_net_price
          quantity = details[:selected_quantity] || spec_item.quantity
          {
            invite_id: bid.invite_id,
            unit_price: price,
            quantity: quantity,
            extended_price: quantity.present? && price.present? ? quantity.to_d * price.to_d : nil,
            delta: avg && price ? (price - avg).round(4) : nil,
            quote_type: details[:selected_line].present? ? (details[:selected_line].is_substitution? ? 'alt' : 'bod') : nil,
            lead_time_days: details[:selected_line]&.lead_time_days,
            dealer_notes: details[:selected_line]&.dealer_notes,
            has_bod_price: details[:basis_line].present?,
            has_alt_price: details[:substitution_line].present?,
            bod_unit_price: details[:basis_line]&.unit_net_price,
            alt_unit_price: details[:substitution_line]&.unit_net_price,
            selected_alt_product_name: details[:selected_line]&.is_substitution? ? details[:selected_line]&.substitution_product_name : nil,
            selected_alt_brand_name: details[:selected_line]&.is_substitution? ? details[:selected_line]&.substitution_brand_name : nil,
            alt_product_name: details[:substitution_line]&.substitution_product_name,
            alt_brand_name: details[:substitution_line]&.substitution_brand_name,
            uploads: Array(uploads_by_spec_and_invite[[spec_item.id, bid.invite_id, details[:selected_line]&.is_substitution? ? true : false]])
          }
        end

        best_price = line_prices.min

        {
          spec_item_id: spec_item.id,
          active: spec_item.active?,
          source_spec_item_id: spec_item.spec_item_id,
          image_url: spec_item.image_url,
          source_url: spec_item.source_url,
          category: spec_item.category,
          manufacturer: spec_item.manufacturer,
          product_name: spec_item.product_name,
          sku: spec_item.sku,
          quantity: spec_item.quantity,
          uom: spec_item.uom,
          awarded_bid_id: row_award&.bid_id,
          awarded_invite_id: row_award&.bid&.invite_id,
          awarded_at: row_award&.awarded_at,
          awarded_price_source: row_award&.price_source,
          awarded_unit_price_snapshot: row_award&.unit_price_snapshot,
          awarded_extended_price_snapshot: row_award&.extended_price_snapshot,
          notes: spec_item.notes,
          description: spec_item.description,
          attributes_text: spec_item.attributes_text,
          nested_products: spec_item.nested_products,
          avg_unit_price: avg,
          avg_extended_price: begin
            extended_values = dealer_cells.map { |cell| cell[:extended_price] }.compact
            extended_values.any? ? (extended_values.sum / extended_values.length.to_d).round(4) : nil
          end,
          best_unit_price: best_price,
          dealers: dealer_cells
        }
      end

      {
        bid_package_id: @bid_package.id,
        excluded_spec_item_ids: @excluded_spec_item_ids,
        awarded_bid_id: @bid_package.awarded_bid_id,
        awarded_at: @bid_package.awarded_at,
        package_award_status: @bid_package.package_award_status,
        awarded_row_count: @bid_package.awarded_row_count,
        eligible_row_count: @bid_package.eligible_award_row_count,
        award_winner_scope: @bid_package.award_winner_scope,
        active_general_fields: @bid_package.active_general_fields,
        dealers: dealers,
        rows: rows
      }
    end

    private

    def dealer_price_mode_for_invite(invite_id)
      raw = @price_modes[invite_id.to_s] || @price_modes[invite_id.to_i]
      raw.to_s.downcase == 'alt' ? 'alt' : 'bod'
    end

    def cell_price_mode_for(spec_item_id, invite_id)
      by_spec_item = @cell_price_modes[spec_item_id.to_s] || @cell_price_modes[spec_item_id.to_i]
      return nil unless by_spec_item.respond_to?(:[])

      raw = by_spec_item[invite_id.to_s] || by_spec_item[invite_id.to_i]
      mode = raw.to_s.downcase
      return 'alt' if mode == 'alt'
      return 'bod' if mode == 'bod'

      nil
    end

    def preferred_mode_for(spec_item_id, invite_id)
      cell_mode = cell_price_mode_for(spec_item_id, invite_id)
      return cell_mode if cell_mode.present?

      dealer_price_mode_for_invite(invite_id)
    end

    def selected_line_item_for_spec_item(bid, spec_item_id, preferred_mode)
      details = line_item_details_for_spec_item(bid, spec_item_id, preferred_mode)
      details[:selected_line]
    end

    def active_subtotal_for_bid(bid)
      spec_items_scope = @bid_package.spec_items
      spec_items_scope = spec_items_scope.active unless @include_inactive
      spec_items_scope = spec_items_scope.where.not(id: @excluded_spec_item_ids) if @excluded_spec_item_ids.any?

      spec_items_scope.sum do |spec_item|
        details = line_item_details_for_spec_item(bid, spec_item.id, preferred_mode_for(spec_item.id, bid.invite_id))
        line_item = details[:selected_line]
        quantity = details[:selected_quantity] || spec_item.quantity
        unit_net = line_item&.unit_net_price
        quantity.present? && unit_net.present? ? quantity.to_d * unit_net.to_d : 0.to_d
      end
    end

    def line_item_details_for_spec_item(bid, spec_item_id, preferred_mode)
      lines = bid.bid_line_items.select { |line| line.spec_item_id == spec_item_id }
      return { selected_line: nil, basis_line: nil, substitution_line: nil } if lines.empty?

      basis_priced = lines.find { |line| !line.is_substitution? && line.unit_price.present? }
      substitution_priced = lines.find { |line| line.is_substitution? && line.unit_price.present? }
      selected_line =
        if basis_priced && substitution_priced
          preferred_mode == 'alt' ? substitution_priced : basis_priced
        else
          basis_priced || substitution_priced
        end

      selected_line ||= lines.find { |line| !line.is_substitution? } || lines.find(&:is_substitution?)

      {
        selected_line: selected_line,
        basis_line: basis_priced,
        substitution_line: substitution_priced,
        selected_quantity: selected_line&.quantity || basis_priced&.quantity || substitution_priced&.quantity || lines.find { |line| line.quantity.present? }&.quantity
      }
    end

    def serialize_upload(upload)
      {
        id: upload.id,
        file_name: upload.file_name,
        note: upload.note,
        spec_item_id: upload.spec_item_id,
        is_substitution: upload.substitution_upload?,
        requirement_key: upload.api_requirement_key,
        byte_size: upload.byte_size,
        uploader_role: upload.uploader_role,
        uploaded_by: upload.invite&.dealer_name || upload.uploader_role.to_s.titleize,
        uploaded_at: upload.created_at,
        download_url: upload.file_available? ? "/api/bid_packages/#{@bid_package.id}/post_award_uploads/#{upload.id}/download" : nil,
        preview_url: upload.file_available? ? "/api/bid_packages/#{@bid_package.id}/post_award_uploads/#{upload.id}/preview" : nil
      }
    end
  end
end
