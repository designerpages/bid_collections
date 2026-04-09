module CsvImports
  class BidPackageCommitService
    # Ruby 2.4 doesn't support Struct keyword_init:
    Result = Struct.new(:success?, :bid_package, :imported_items_count, :errors)

    def initialize(project:, package_name:, source_filename:, parsed_rows:, visibility: 'private', active_general_fields: nil, instructions: nil, custom_questions: nil)
      @project = project
      @package_name = package_name
      @source_filename = source_filename
      @parsed_rows = parsed_rows
      @visibility = visibility
      @active_general_fields = active_general_fields
      @instructions = instructions
      @custom_questions = custom_questions
    end

    def call
      bid_package = nil

      ActiveRecord::Base.transaction do
        bid_package = @project.bid_packages.create!(
          name: @package_name,
          source_filename: @source_filename,
          imported_at: Time.current,
          visibility: @visibility,
          active_general_fields: @active_general_fields || BidPackage::GENERAL_PRICING_FIELDS,
          instructions: @instructions,
          custom_questions: @custom_questions || []
        )

        @parsed_rows.each do |row|
          bid_package.spec_items.create!(row)
        end
      end

      Result.new(true, bid_package, @parsed_rows.size, [])
    rescue ActiveRecord::RecordInvalid => e
      Result.new(false, nil, 0, e.record.errors.full_messages)
    end
  end
end
