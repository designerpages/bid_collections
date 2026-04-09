module Exports
  class BidPackageComparisonXlsxService
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

      package = Axlsx::Package.new
      workbook = package.workbook

      workbook.add_worksheet(name: 'Comparison') do |sheet|
        header_style = workbook.styles.add_style(
          b: true,
          bg_color: 'F1F5F9',
          border: { style: :thin, color: 'D1D5DB' },
          alignment: { horizontal: :center, vertical: :center, wrap_text: true }
        )
        currency_style = workbook.styles.add_style(num_fmt: 5)

        base_count = base_columns.length
        per_dealer_count = dealer_columns.length
        total_columns = base_count + (dealers.length * per_dealer_count)

        group_headers = Array.new(total_columns, '')
        if per_dealer_count.positive?
          dealers.each_with_index do |dealer, index|
            start_col = base_count + (index * per_dealer_count)
            end_col = start_col + per_dealer_count - 1
            group_headers[start_col] = dealer_header_label(dealer)
            sheet.merge_cells("#{excel_col_name(start_col)}1:#{excel_col_name(end_col)}1") if end_col > start_col
          end
        end

        sheet.add_row(group_headers, style: Array.new(total_columns, header_style))

        headers = build_headers(dealers, base_columns, dealer_columns)
        sheet.add_row(headers, style: Array.new(headers.length, header_style))
        sheet.rows.first.height = 28
        sheet.rows[1].height = 46

        comparison[:rows].each do |row|
          values, types, styles = build_row(row, dealers, base_columns, dealer_columns, currency_style)
          sheet.add_row(values, types: types, style: styles)
        end

        base_widths = base_columns.map { |column| column_width(column) }
        dealer_widths = dealers.flat_map { dealer_columns.map { |column| column_width(column) } }
        sheet.column_widths(*(base_widths + dealer_widths))

        sheet.sheet_view.pane do |pane|
          pane.top_left_cell = 'A3'
          pane.state = :frozen
          pane.y_split = 2
        end
      end

      package.to_stream.read
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

    def build_row(row, dealers, base_columns, dealer_columns, currency_style)
      values = []
      types = []
      styles = []

      base_columns.each do |column|
        value, type, style = base_cell_value(row, column, currency_style)
        values << value
        types << type
        styles << style
      end

      visible_prices = row_visible_dealer_prices(row, dealers)

      dealers.each do |dealer|
        cell = row[:dealers].find { |entry| String(entry[:invite_id]) == String(dealer[:invite_id]) }
        dealer_columns.each do |column|
          value, type, style = dealer_cell_value(row, cell, column, visible_prices, currency_style)
          values << value
          types << type
          styles << style
        end
      end

      [values, types, styles]
    end

    def base_cell_value(row, column, currency_style)
      case column
      when 'code_tag'
        [row[:sku], :string, nil]
      when 'product'
        [row[:product_name], :string, nil]
      when 'brand'
        [row[:manufacturer], :string, nil]
      when 'designer_qty_uom'
        [qty_uom(row[:quantity], row[:uom]), :string, nil]
      when 'avg_unit_price'
        [numeric_or_nil(row[:avg_unit_price]), :float, currency_style]
      when 'avg_extended_price'
        [numeric_or_nil(row[:avg_extended_price]), :float, currency_style]
      else
        [nil, :string, nil]
      end
    end

    def dealer_cell_value(row, cell, column, visible_prices, currency_style)
      unit_price = numeric_or_nil(cell&.dig(:unit_price))
      quantity = cell&.dig(:quantity) || row[:quantity]

      case column
      when 'dealer_qty_uom'
        [qty_uom(quantity, row[:uom]), :string, nil]
      when 'dealer_unit_price'
        [unit_price, :float, currency_style]
      when 'dealer_lead_time_days'
        [cell&.dig(:lead_time_days), :string, nil]
      when 'dealer_notes'
        [cell&.dig(:dealer_notes), :string, nil]
      when 'dealer_extended'
        [extended_price(unit_price, quantity), :float, currency_style]
      when 'dealer_delta'
        [dealer_delta_value(unit_price, row[:avg_unit_price], visible_prices), :string, nil]
      when 'dealer_next_delta'
        [next_best_delta_display(visible_prices, unit_price), :string, nil]
      else
        [nil, :string, nil]
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

    def column_width(column)
      case column
      when 'code_tag' then 11
      when 'product' then 20
      when 'brand' then 16
      when 'designer_qty_uom' then 11
      when 'avg_unit_price' then 12
      when 'avg_extended_price' then 13
      when 'dealer_qty_uom' then 10
      when 'dealer_unit_price' then 12
      when 'dealer_lead_time_days' then 14
      when 'dealer_notes' then 20
      when 'dealer_extended' then 13
      when 'dealer_delta', 'dealer_next_delta' then 16
      else 12
      end
    end

    def excel_col_name(zero_based_index)
      n = zero_based_index.to_i + 1
      out = +''
      while n > 0
        n -= 1
        out.prepend((65 + (n % 26)).chr)
        n /= 26
      end
      out
    end

    def format_header_label(value)
      value.to_s.tr('_', ' ').upcase.gsub(/\bPERCENT\b/, '%')
    end
  end
end
