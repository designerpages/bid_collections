class BidCollectionsCreateBidRowAwards < ActiveRecord::Migration[5.2]
  def change
    create_table :bid_row_awards do |t|
      t.bigint :bid_package_id, null: false
      t.bigint :spec_item_id, null: false
      t.bigint :bid_id, null: false
      t.string :price_source, null: false, default: 'bod'
      t.decimal :unit_price_snapshot, precision: 12, scale: 4
      t.decimal :extended_price_snapshot, precision: 14, scale: 2
      t.string :awarded_by, null: false
      t.datetime :awarded_at, null: false

      t.timestamps
    end

    add_index :bid_row_awards, [:bid_package_id, :spec_item_id], unique: true, name: 'idx_bid_row_awards_unique'
    add_index :bid_row_awards, :bid_id
    add_foreign_key :bid_row_awards, :bid_packages
    add_foreign_key :bid_row_awards, :spec_items
    add_foreign_key :bid_row_awards, :bids
  end
end
