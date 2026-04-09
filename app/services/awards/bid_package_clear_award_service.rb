module Awards
  class BidPackageClearAwardService
    class Result
      attr_reader :bid_package, :bid_award_event, :error_key, :errors

      def initialize(success:, bid_package: nil, bid_award_event: nil, error_key: nil, errors: nil)
        @success = success
        @bid_package = bid_package
        @bid_award_event = bid_award_event
        @error_key = error_key
        @errors = errors
      end

      def success?
        @success
      end
    end

    def initialize(bid_package:, awarded_by:, note: nil, awarded_amount_snapshot: nil, comparison_snapshot: nil)
      @bid_package = bid_package
      @awarded_by = awarded_by.to_s.strip.presence || 'Unknown'
      @note = note
      @awarded_amount_snapshot = awarded_amount_snapshot
      @comparison_snapshot = normalized_comparison_snapshot(comparison_snapshot)
    end

    def call
      current_awarded_bid = @bid_package.awarded_bid
      return failure(:no_existing_award, 'No existing award found to remove.') if current_awarded_bid.blank?

      cleared_at = Time.current
      snapshot_amount = resolved_awarded_amount_snapshot(current_awarded_bid)
      bid_award_event = nil

      ActiveRecord::Base.transaction do
        @bid_package.bids.update_all(selection_status: Bid.selection_statuses[:pending], updated_at: Time.current)
        @bid_package.update!(awarded_bid: nil, awarded_at: nil)

        bid_award_event = @bid_package.bid_award_events.create!(
          from_bid: current_awarded_bid,
          to_bid: current_awarded_bid,
          event_type: :unaward,
          awarded_amount_snapshot: snapshot_amount,
          awarded_by: @awarded_by,
          note: @note,
          awarded_at: cleared_at,
          comparison_snapshot: @comparison_snapshot
        )
      end

      Result.new(success: true, bid_package: @bid_package, bid_award_event: bid_award_event)
    rescue ActiveRecord::RecordInvalid => e
      failure(:invalid_record, e.record.errors.full_messages)
    end

    private

    def resolved_awarded_amount_snapshot(bid)
      explicit_amount = @awarded_amount_snapshot.to_d if @awarded_amount_snapshot.present?
      return explicit_amount.round(2) if explicit_amount

      bid.latest_total_amount.round(2)
    end

    def failure(error_key, errors)
      Result.new(success: false, error_key: error_key, errors: Array(errors))
    end

    def normalized_comparison_snapshot(snapshot)
      raw = snapshot.is_a?(Hash) ? snapshot : {}
      {
        excluded_spec_item_ids: Array(raw[:excluded_spec_item_ids] || raw['excluded_spec_item_ids']).map(&:to_i).uniq,
        cell_price_mode: raw[:cell_price_mode].is_a?(Hash) ? raw[:cell_price_mode] : (raw['cell_price_mode'].is_a?(Hash) ? raw['cell_price_mode'] : {})
      }
    end
  end
end
