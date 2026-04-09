require 'csv'

module CsvImports
  class BidPackagePreviewService
    REQUIRED_FIELDS = %w[
      category manufacturer product_name sku description quantity uom
    ].freeze

    OPTIONAL_FIELDS = %w[
      spec_item_id finish color location dimensions link notes image_url source_url attributes_text nested_products
    ].freeze

    FIELD_ALIASES = {
      'spec_item_id' => ['spec_item_id', 'Product ID'],
      'category' => ['category', 'DP Categories'],
      'manufacturer' => ['manufacturer', 'Brand'],
      'product_name' => ['product_name', 'Product Name'],
      'sku' => ['sku', 'Code'],
      'description' => ['description', 'Description'],
      'quantity' => ['quantity', 'Quantity', 'Qty'],
      'uom' => ['uom', 'Unit of Measure'],
      'finish' => ['finish'],
      'color' => ['color'],
      'location' => ['location'],
      'dimensions' => ['dimensions'],
      'link' => ['link', 'DP URL', 'Image URL'],
      'notes' => ['notes', 'Notes'],
      'image_url' => ['image_url', 'Image URL'],
      'source_url' => ['source_url', 'DP URL'],
      'attributes_text' => ['attributes_text', 'Attributes'],
      'nested_products' => ['nested_products', 'Nested Products']
    }.freeze

    PROFILE_REQUIRED_FIELDS = {
      'default' => REQUIRED_FIELDS,
      'designer_pages' => %w[spec_item_id]
    }.freeze

    # Ruby 2.4 doesn't support Struct keyword_init:
    Result = Struct.new(:valid?, :rows, :errors, :row_count, :profile)

    def initialize(csv_content:, source_profile: nil)
      @csv_content = csv_content
      @source_profile = source_profile
    end

    def call
      csv = CSV.parse(@csv_content, headers: true)
      headers = csv.headers&.compact || []
      profile = resolve_profile(headers)

      errors = validate_headers(headers, profile)
      rows = []

      csv.each_with_index do |row, idx|
        normalized = normalize_row(row)
        apply_profile_defaults!(normalized, profile)
        next if skip_row_for_profile?(normalized, profile)

        normalized['spec_item_id'] = normalized['spec_item_id'].presence || SecureRandom.uuid

        quantity = parse_quantity(normalized['quantity'])
        if normalized['quantity'].present? && quantity.nil?
          errors << "Row #{idx + 2}: quantity must be numeric and >= 0"
        elsif quantity.present? && quantity < 0
          errors << "Row #{idx + 2}: quantity must be numeric and >= 0"
        end

        required_fields_for(profile).each do |field|
          next if field == 'quantity'
          errors << "Row #{idx + 2}: #{field} is required" if normalized[field].blank?
        end

        normalized['quantity'] = quantity
        rows << normalized.slice(*(REQUIRED_FIELDS + OPTIONAL_FIELDS))
      end

      normalize_duplicate_spec_item_ids!(rows) if profile == 'designer_pages'

      Result.new(errors.empty?, rows, errors, rows.size, profile)
    rescue CSV::MalformedCSVError => e
      Result.new(false, [], ["Malformed CSV: #{e.message}"], 0, 'unknown')
    end

    private

    def resolve_profile(headers)
      return @source_profile if PROFILE_REQUIRED_FIELDS.key?(@source_profile)
      return 'designer_pages' if headers.include?('Product Name') && headers.include?('Brand')

      'default'
    end

    def required_fields_for(profile)
      PROFILE_REQUIRED_FIELDS.fetch(profile)
    end

    def validate_headers(headers, profile)
      errors = []

      required_fields_for(profile).each do |field|
        next if present_alias?(headers, field)

        accepted = FIELD_ALIASES.fetch(field).join(' or ')
        errors << "Missing required header for #{field} (accepted: #{accepted})"
      end

      duplicates = headers.select { |h| headers.count(h) > 1 }.uniq
      errors << "Duplicate headers: #{duplicates.join(', ')}" if duplicates.any?

      errors
    end

    def present_alias?(headers, field)
      aliases = FIELD_ALIASES.fetch(field)
      aliases.any? { |candidate| headers.include?(candidate) }
    end

    def normalize_row(row)
      out = {}

      (REQUIRED_FIELDS + OPTIONAL_FIELDS).each do |field|
        out[field] = fetch_alias_value(row, field)
      end

      out
    end

    def apply_profile_defaults!(row, profile)
      return unless profile == 'designer_pages'

      row['uom'] = 'EA' if row['uom'].blank?
      row['product_name'] = "Product #{row['spec_item_id']}" if row['product_name'].blank? && row['spec_item_id'].present?
      row['sku'] = row['spec_item_id'].to_s if row['sku'].blank? && row['spec_item_id'].present?
      row['manufacturer'] = 'Unknown' if row['manufacturer'].blank?
      row['category'] = 'Uncategorized' if row['category'].blank?
      row['description'] = '' if row['description'].blank?

      row['link'] = row['source_url'] if row['link'].blank?
      row['notes'] = row['nested_products'] if row['notes'].blank?
    end

    def skip_row_for_profile?(row, profile)
      return false unless profile == 'designer_pages'

      row['spec_item_id'].blank?
    end

    def fetch_alias_value(row, field)
      aliases = FIELD_ALIASES.fetch(field)
      aliases.each do |candidate|
        value = row[candidate]
        return value if value.present?
      end

      nil
    end

    def parse_quantity(value)
      return nil if value.blank?

      BigDecimal(value.to_s)
    rescue ArgumentError
      nil
    end

    def normalize_duplicate_spec_item_ids!(rows)
      seen_counts = Hash.new(0)

      rows.each do |row|
        base = row['spec_item_id'].to_s
        seen_counts[base] += 1
        next if seen_counts[base] == 1

        row['spec_item_id'] = "#{base}-#{seen_counts[base]}"
      end
    end
  end
end
