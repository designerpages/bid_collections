class BidCollectionsRenameInvitesTableToBidCollectionInvites < ActiveRecord::Migration[5.2]
  def up
    return if table_exists?(:bid_collection_invites)
    return unless table_exists?(:invites)
    # Only rename legacy engine "invites" tables; skip unrelated host tables with the same name.
    return unless column_exists?(:invites, :bid_package_id) && column_exists?(:invites, :token)

    rename_table :invites, :bid_collection_invites
  end

  def down
    return unless table_exists?(:bid_collection_invites)
    return if table_exists?(:invites)

    rename_table :bid_collection_invites, :invites
  end
end
