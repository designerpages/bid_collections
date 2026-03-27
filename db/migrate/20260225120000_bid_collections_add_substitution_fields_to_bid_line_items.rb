class BidCollectionsAddSubstitutionFieldsToBidLineItems < ActiveRecord::Migration[5.2]
  def change
    add_column :bid_line_items, :is_substitution, :boolean, null: false, default: false
    add_column :bid_line_items, :substitution_product_name, :string
    add_column :bid_line_items, :substitution_brand_name, :string

    remove_index :bid_line_items, name: 'index_bid_line_items_on_bid_id_and_spec_item_id'
    add_index :bid_line_items, [:bid_id, :spec_item_id, :is_substitution], unique: true, name: 'index_bid_line_items_on_bid_spec_substitution'
  end
end
