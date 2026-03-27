class BidCollectionsAddAwardTrackingToBidsAndBidPackages < ActiveRecord::Migration[5.2]
  def change
    add_column :bids, :selection_status, :integer, null: false, default: 0
    add_index :bids, :selection_status

    add_reference :bid_packages, :awarded_bid, foreign_key: { to_table: :bids }, null: true
    add_column :bid_packages, :awarded_at, :datetime
  end
end
