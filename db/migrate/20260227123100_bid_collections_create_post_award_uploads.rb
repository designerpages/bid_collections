class BidCollectionsCreatePostAwardUploads < ActiveRecord::Migration[5.2]
  def change
    create_table :post_award_uploads do |t|
      t.references :bid_package, null: false, foreign_key: true
      t.references :spec_item, null: true, foreign_key: true
      t.references :invite, null: true, foreign_key: true
      t.integer :uploader_role, null: false, default: 0
      t.string :file_name, null: false
      t.text :note

      t.timestamps
    end

    add_index :post_award_uploads, [:bid_package_id, :spec_item_id, :created_at], name: 'idx_post_award_uploads_lookup'
  end
end
