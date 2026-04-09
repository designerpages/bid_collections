class AddDealerQuantityToBidLineItemsAndMakeSpecItemQuantityOptional < ActiveRecord::Migration[5.2]
  def change
    add_column :bid_line_items, :quantity, :decimal, precision: 12, scale: 3
    change_column_null :spec_items, :quantity, true
  end
end
