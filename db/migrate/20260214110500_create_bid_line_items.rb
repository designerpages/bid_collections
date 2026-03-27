class BidCollectionsCreateBidLineItems < ActiveRecord::Migration[5.2]
  def change
    create_table :bid_line_items do |t|
      t.references :bid, null: false, foreign_key: true
      t.references :spec_item, null: false, foreign_key: true
      t.decimal :unit_price, precision: 12, scale: 4
      t.integer :lead_time_days
      t.text :dealer_notes

      t.timestamps
    end

    add_index :bid_line_items, [:bid_id, :spec_item_id], unique: true
    add_index :bid_line_items, [:spec_item_id, :unit_price]
  end
end
