require 'csv'

module Exports
  class BidPackageComparisonCsvService
    BASE_COLUMNS = %w[
      code_tag
      product
      brand
      designer_qty_uom
      avg_unit_price
      avg_extended_price
    ].freeze
    DEALER_COLUMNS = %w[
      dealer_qty_uom
      dealer_unit_price
      dealer_lead_time_days
      dealer_notes
      dealer_extended
      dealer_delta
      dealer_next_delta
    ].freeze
    ALLOWED_COLUMNS = (BASE_COLUMNS + DEALER_COLUMNS).freeze

    def initialize(
      bid_package:,
      price_modes: {},
      cell_price_modes: {},
      excluded_spec_item_ids: [],
      comparison_mode: 'average',
      show_product: true,
      show_brand: true,
      show_unit_price: true,
      show_lead_time: false,
      show_notes: false,
      visible_dealer_invite_ids: [],
      column_order: []
    )
      @bid_package = bid_package
      @price_modes = price_modes || {}
      @cell_price_modes = cell_price_modes || {}
      @excluded_spec_item_ids = Array(excluded_spec_item_ids).map(&:to_i).uniq
      @comparison_mode = comparison_mode.to_s
      @show_product = show_product
      @show_brand = show_brand
      @show_unit_price = show_unit_price
      @show_lead_time = show_lead_time
      @show_notes = show_notes
      @visible_dealer_invite_ids = Array(visible_dealer_invite_ids).map(&:to_s).reject(&:blank?)
      @column_order = Array(column_order).map(&:to_s)
    end

    def call
      comparison = Comparison::BidPackageComparisonService.new(
        bid_package: @bid_package,
        price_modes: @price_modes,
        cell_price_modes: @cell_price_modes,
        excluded_spec_item_ids: @excluded_spec_item_ids
      ).call
      dealers = ordered_dealers(comparison[:dealers])
      base_columns = effective_base_columns
      dealer_columns = effective_dealer_columns

      CSV.generate(headers: true) do |csv|
        csv << build_headers(dealers, base_columns, dealer_columns)

        comparison[:rows].each do |row|
          csv << build_row(row, dealers, base_columns, dealer_columns)
        end
      end
    end

    private

    def build_headers(dealers, base_columns, dealer_columns)
      headers = base_columns.map { |column| base_header_label(column) }
      dealers.each do |dealer|
        label = dealer_header_label(dealer)
        dealer_columns.each do |column|
          headers << "#{label}_#{dealer_header_suffix(column)}"
        end
      end

      headers.map { |value| format_header_label(value) }
    end

    def build_row(row, dealers, base_columns, dealer_columns)
      out = base_columns.map { |column| row_base_value(row, column) }
      visible_prices = row_visible_dealer_prices(row, dealers)

      dealers.each do |dealer|
        cell = row[:dealers].find { |d| String(d[:invite_id]) == String(dealer[:invite_id]) }
        dealer_columns.each do |column|
          out << row_dealer_value(row, cell, column, visible_prices)
        end
      end
      out
    end

    def row_base_value(row, column)
      case column
      when 'code_tag'
        row[:sku]
      when 'product'
        row[:product_name]
      when 'brand'
        row[:manufacturer]
      when 'designer_qty_uom'
        qty_uom(row[:quantity], row[:uom])
      when 'avg_unit_price'
        row[:avg_unit_price]
      when 'avg_extended_price'
        row[:avg_extended_price]
      else
        nil
      end
    end

    def row_dealer_value(row, cell, column, visible_prices)
      unit_price = numeric_or_nil(cell&.dig(:unit_price))
      quantity = cell&.dig(:quantity) || row[:quantity]

      case column
      when 'dealer_qty_uom'
        qty_uom(quantity, row[:uom])
      when 'dealer_unit_price'
        unit_price
      when 'dealer_lead_time_days'
        cell&.dig(:lead_time_days)
      when 'dealer_notes'
        cell&.dig(:dealer_notes)
      when 'dealer_extended'
        extended_price(unit_price, quantity)
      when 'dealer_delta'
        dealer_delta_value(unit_price, row[:avg_unit_price], visible_prices)
      when 'dealer_next_delta'
        next_best_delta_display(visible_prices, unit_price)
      else
        nil
      end
    end

    def dealer_delta_value(unit_price, avg_unit_price, visible_prices)
      return nil if unit_price.nil?

      if @comparison_mode == 'competitive'
        better_delta_display(visible_prices, unit_price)
      else
        percent_against_display(unit_price, avg_unit_price)
      end
    end

    def include_average_columns?
      @comparison_mode == 'average'
    end

    def include_delta_column?
      @comparison_mode == 'average' || @comparison_mode == 'competitive'
    end

    def include_next_delta_column?
      @comparison_mode == 'competitive'
    end

    def default_base_columns
      columns = ['code_tag']
      columns << 'product' if @show_product
      columns << 'brand' if @show_brand
      columns << 'designer_qty_uom'
      if include_average_columns?
        columns << 'avg_unit_price'
        columns << 'avg_extended_price'
      end
      columns
    end

    def default_dealer_columns
      columns = ['dealer_qty_uom']
      columns << 'dealer_unit_price' if @show_unit_price
      columns << 'dealer_lead_time_days' if @show_lead_time
      columns << 'dealer_notes' if @show_notes
      columns << 'dealer_extended'
      columns << 'dealer_delta' if include_delta_column?
      columns << 'dealer_next_delta' if include_next_delta_column?
      columns
    end

    def normalized_column_order
      @normalized_column_order ||= @column_order
                                  .map(&:to_s)
                                  .select { |key| ALLOWED_COLUMNS.include?(key) }
                                  .uniq
    end

    def effective_base_columns
      columns = normalized_column_order.select { |key| BASE_COLUMNS.include?(key) }
      columns = default_base_columns if columns.empty?
      columns
    end

    def effective_dealer_columns
      columns = normalized_column_order.select { |key| DEALER_COLUMNS.include?(key) }
      columns = default_dealer_columns if columns.empty?
      columns
    end

    def ordered_dealers(dealers)
      return dealers if @visible_dealer_invite_ids.empty?

      by_invite_id = dealers.index_by { |dealer| dealer[:invite_id].to_s }
      ordered = @visible_dealer_invite_ids.map { |invite_id| by_invite_id[invite_id] }.compact
      ordered.presence || dealers
    end

    def row_visible_dealer_prices(row, dealers)
      dealers
        .map do |dealer|
          cell = row[:dealers].find { |entry| String(entry[:invite_id]) == String(dealer[:invite_id]) }
          numeric_or_nil(cell&.dig(:unit_price))
        end
        .compact
    end

    def sorted_unique(values)
      values.map { |value| numeric_or_nil(value) }.compact.uniq.sort
    end

    def better_delta_display(values, current_value)
      current = numeric_or_nil(current_value)
      return '—' if current.nil?

      prices = sorted_unique(values)
      return '—' if prices.length < 2

      idx = prices.index(current)
      return '—' if idx.nil?
      return 'NA, Lowest Price' if idx.zero?

      better = prices[idx - 1]
      return '—' if better.nil? || better.zero?

      percent_display(((current - better) / better) * 100)
    end

    def next_best_delta_display(values, current_value)
      current = numeric_or_nil(current_value)
      return '—' if current.nil?

      prices = sorted_unique(values)
      return '—' if prices.length < 2

      idx = prices.index(current)
      return '—' if idx.nil?
      return 'NA, Highest Price' if idx == prices.length - 1

      next_value = prices[idx + 1]
      return '—' if next_value.nil? || current.zero?

      delta =
        if idx.zero?
          ((current - next_value) / current) * 100
        else
          ((next_value - current) / current) * 100
        end
      percent_display(delta)
    end

    def percent_against_display(value, baseline)
      v = numeric_or_nil(value)
      b = numeric_or_nil(baseline)
      return '—' if v.nil? || b.nil? || b.zero?

      percent_display(((v - b) / b) * 100)
    end

    def percent_display(value)
      return '—' if value.nil?

      rounded = value.round(1)
      "#{rounded.positive? ? '+' : ''}#{format('%.1f', rounded)}%"
    end

    def numeric_or_nil(value)
      return nil if value.blank?

      value.to_d.to_f
    end

    def extended_price(unit_price, quantity)
      unit = numeric_or_nil(unit_price)
      qty = numeric_or_nil(quantity)
      return nil if unit.nil? || qty.nil?

      unit * qty
    end

    def qty_uom(quantity, uom)
      qty = quantity.blank? ? '—' : quantity.to_s
      unit = uom.blank? ? '' : " #{uom}"
      "#{qty}#{unit}"
    end

    def base_header_label(column)
      case column
      when 'designer_qty_uom'
        'designer_qty_uom'
      else
        column
      end
    end

    def dealer_header_suffix(column)
      case column
      when 'dealer_qty_uom' then 'qty_uom'
      when 'dealer_unit_price' then 'unit_price'
      when 'dealer_lead_time_days' then 'lead_time_days'
      when 'dealer_notes' then 'notes'
      when 'dealer_extended' then 'extended_price'
      when 'dealer_delta'
        @comparison_mode == 'competitive' ? 'percent_next_lower' : 'percent_avg_delta'
      when 'dealer_next_delta' then 'percent_next_higher'
      else
        column.to_s.sub(/\Adealer_/, '')
      end
    end

    def dealer_header_label(dealer)
      email = dealer[:dealer_email].to_s.strip
      return email if email.present?

      raw = dealer[:dealer_name].to_s
      company = raw.split(/\s[-–—]\s/, 2).first.to_s.strip
      company.present? ? company : raw
    end

    def format_header_label(value)
      label = value.to_s.tr('_', ' ').upcase
      label.gsub(/\bPERCENT\b/, '%')
    end
  end
end
