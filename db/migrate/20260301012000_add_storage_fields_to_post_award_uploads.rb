class BidCollectionsAddStorageFieldsToPostAwardUploads < ActiveRecord::Migration[5.2]
  def change
    add_column :post_award_uploads, :storage_path, :string
    add_column :post_award_uploads, :content_type, :string
    add_column :post_award_uploads, :byte_size, :bigint
  end
end
