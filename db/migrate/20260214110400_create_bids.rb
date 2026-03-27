class BidCollectionsCreateBids < ActiveRecord::Migration[5.2]
  def change
    create_table :bids do |t|
      t.references :invite, null: false, foreign_key: true, index: { unique: true }
      t.integer :state, null: false, default: 0
      t.datetime :submitted_at

      t.timestamps
    end

    add_index :bids, :state
  end
end
