class BidCollectionsAddComparisonSnapshotToBidAwardEvents < ActiveRecord::Migration[5.2]
  def change
    add_column :bid_award_events, :comparison_snapshot, :json
  end
end
