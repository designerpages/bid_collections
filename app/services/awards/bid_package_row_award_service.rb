module Awards
  class BidPackageRowAwardService
    class Result
      attr_reader :bid_package, :error_key, :errors

      def initialize(success:, bid_package: nil, error_key: nil, errors: nil)
        @success = success
        @bid_package = bid_package
        @error_key = error_key
        @errors = errors
      end

      def success?
        @success
      end
    end

    def initialize(bid_package:, selections:, awarded_by:)
      @bid_package = bid_package
      @selections = Array(selections)
      @awarded_by = awarded_by.to_s.strip.presence || 'Unknown'
    end

    def call
      return failure(:no_selections, 'No row awards were provided') if @selections.empty?

      normalized = @selections.map { |selection| normalize_selection(selection) }
      validate_selections!(normalized)

      awarded_at = Time.current

      ActiveRecord::Base.transaction do
        normalized.each do |selection|
          row_award = @bid_package.bid_row_awards.find_or_initialize_by(spec_item_id: selection[:spec_item_id])
          row_award.assign_attributes(
            bid_id: selection[:bid_id],
            price_source: selection[:price_source],
            unit_price_snapshot: selection[:unit_price_snapshot],
            extended_price_snapshot: selection[:extended_price_snapshot],
            awarded_by: @awarded_by,
            awarded_at: awarded_at
          )
          row_award.save!
        end

        @bid_package.refresh_award_summary!
      end

      Result.new(success: true, bid_package: @bid_package)
    rescue ActiveRecord::RecordInvalid => e
      failure(:invalid_record, e.record.errors.full_messages)
    rescue ArgumentError => e
      failure(:invalid_selection, e.message)
    end

    private

    def normalize_selection(selection)
      raw = selection.respond_to?(:to_h) ? selection.to_h : {}
      spec_item_id = Integer(raw[:spec_item_id] || raw['spec_item_id'])
      bid_id = Integer(raw[:bid_id] || raw['bid_id'])
      price_source = (raw[:price_source] || raw['price_source']).to_s
      price_source = 'bod' unless %w[bod alt].include?(price_source)
      unit_price_snapshot = decimal_or_nil(raw[:unit_price_snapshot] || raw['unit_price_snapshot'])
      extended_price_snapshot = decimal_or_nil(raw[:extended_price_snapshot] || raw['extended_price_snapshot'])

      {
        spec_item_id: spec_item_id,
        bid_id: bid_id,
        price_source: price_source,
        unit_price_snapshot: unit_price_snapshot,
        extended_price_snapshot: extended_price_snapshot
      }
    end

    def validate_selections!(normalized)
      package_spec_item_ids = @bid_package.spec_items.pluck(:id)
      package_spec_item_id_set = package_spec_item_ids.each_with_object({}) { |id, memo| memo[id] = true }
      package_bids = @bid_package.bids.includes(:invite).index_by(&:id)
      seen_spec_item_ids = {}

      normalized.each do |selection|
        spec_item_id = selection[:spec_item_id]
        bid_id = selection[:bid_id]

        raise ArgumentError, 'Each awarded row must belong to this bid package' unless package_spec_item_id_set[spec_item_id]
        raise ArgumentError, 'Each row can only be selected once per commit' if seen_spec_item_ids[spec_item_id]

        bid = package_bids[bid_id]
        raise ArgumentError, 'Selected bid does not belong to this bid package' if bid.blank?
        raise ArgumentError, 'Only submitted bids can be awarded' unless bid.submitted?

        seen_spec_item_ids[spec_item_id] = true
      end
    end

    def decimal_or_nil(value)
      return nil if value.blank?

      BigDecimal(value.to_s)
    end

    def failure(error_key, errors)
      Result.new(success: false, error_key: error_key, errors: Array(errors))
    end
  end
end
