class BidCollectionsAddRequirementKeyToPostAwardUploads < ActiveRecord::Migration[5.2]
  def change
    add_column :post_award_uploads, :requirement_key, :string
    add_index :post_award_uploads, [:bid_package_id, :spec_item_id, :requirement_key], name: 'idx_post_award_uploads_requirement'
  end
end

