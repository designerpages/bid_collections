class BidCollectionsCreateBidAwardEvents < ActiveRecord::Migration[5.2]
  def change
    create_table :bid_award_events do |t|
      t.references :bid_package, null: false, foreign_key: true
      t.references :from_bid, null: true, foreign_key: { to_table: :bids }
      t.references :to_bid, null: false, foreign_key: { to_table: :bids }
      t.integer :event_type, null: false
      t.decimal :awarded_amount_snapshot, precision: 14, scale: 2, null: false
      t.string :awarded_by, null: false
      t.text :note
      t.datetime :awarded_at, null: false

      t.timestamps
    end

    add_index :bid_award_events, [:bid_package_id, :awarded_at]
    add_index :bid_award_events, :event_type
  end
end
