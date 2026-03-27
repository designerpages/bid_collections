class BidCollectionsAddReopenFieldsToBids < ActiveRecord::Migration[5.2]
  def change
    add_column :bids, :last_reopened_at, :datetime
    add_column :bids, :last_reopen_reason, :string
  end
end

