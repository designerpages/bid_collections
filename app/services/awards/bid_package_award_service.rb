module Awards
  class BidPackageAwardService
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

    def initialize(bid_package:, bid:, awarded_by:, note: nil, allow_reassign: false, awarded_amount_snapshot: nil, comparison_snapshot: nil)
      @bid_package = bid_package
      @bid = bid
      @awarded_by = awarded_by.to_s.strip.presence || 'Unknown'
      @note = note
      @allow_reassign = allow_reassign
      @awarded_amount_snapshot = awarded_amount_snapshot
      @comparison_snapshot = normalized_comparison_snapshot(comparison_snapshot)
    end

    def call
      return failure(:invalid_bid, 'Selected bid does not belong to this bid package') unless bid_in_package?
      return failure(:invalid_bid_state, 'Only submitted bids can be awarded') unless @bid.submitted?

      current_awarded_bid = @bid_package.awarded_bid

      if current_awarded_bid.present? && !@allow_reassign
        return failure(:already_awarded, 'Bid package already has an awarded vendor. Use change award.')
      end

      if current_awarded_bid.present? && current_awarded_bid.id == @bid.id
        return failure(:same_bid, 'Selected bid is already awarded')
      end

      if current_awarded_bid.blank? && @allow_reassign
        return failure(:no_existing_award, 'No existing award found. Use award.')
      end

      event_type = current_awarded_bid.present? ? :reaward : :award
      awarded_at = Time.current
      snapshot_amount = resolved_awarded_amount_snapshot

      bid_award_event = nil

      ActiveRecord::Base.transaction do
        @bid_package.bids.where.not(id: @bid.id).update_all(selection_status: Bid.selection_statuses[:not_selected], updated_at: Time.current)
        @bid.update!(selection_status: :awarded)
        @bid_package.update!(awarded_bid: @bid, awarded_at: awarded_at)

        bid_award_event = @bid_package.bid_award_events.create!(
          from_bid: current_awarded_bid,
          to_bid: @bid,
          event_type: event_type,
          awarded_amount_snapshot: snapshot_amount,
          awarded_by: @awarded_by,
          note: @note,
          awarded_at: awarded_at,
          comparison_snapshot: @comparison_snapshot
        )
      end

      Result.new(success: true, bid_package: @bid_package, bid_award_event: bid_award_event)
    rescue ActiveRecord::RecordInvalid => e
      failure(:invalid_record, e.record.errors.full_messages)
    end

    private

    def bid_in_package?
      @bid.invite&.bid_package_id == @bid_package.id
    end

    def resolved_awarded_amount_snapshot
      explicit_amount = @awarded_amount_snapshot.to_d if @awarded_amount_snapshot.present?
      return explicit_amount.round(2) if explicit_amount

      @bid.latest_total_amount.round(2)
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
