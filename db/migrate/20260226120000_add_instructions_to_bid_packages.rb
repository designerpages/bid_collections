class BidCollectionsAddInstructionsToBidPackages < ActiveRecord::Migration[5.2]
  def change
    add_column :bid_packages, :instructions, :text
  end
end
