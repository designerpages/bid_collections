class BidCollectionsCreateBidPackages < ActiveRecord::Migration[5.2]
  def change
    create_table :bid_packages do |t|
      t.references :project, null: false, foreign_key: true
      t.string :name, null: false
      t.string :source_filename, null: false
      t.datetime :imported_at, null: false

      t.timestamps
    end

    add_index :bid_packages, [:project_id, :created_at]
  end
end
