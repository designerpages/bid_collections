class BidCollectionsCreateSpecItems < ActiveRecord::Migration[5.2]
  def change
    create_table :spec_items do |t|
      t.references :bid_package, null: false, foreign_key: true
      t.string :spec_item_id, null: false
      t.string :category, null: false
      t.string :manufacturer, null: false
      t.string :product_name, null: false
      t.string :sku, null: false
      t.text :description, null: false
      t.decimal :quantity, precision: 12, scale: 3, null: false
      t.string :uom, null: false

      t.string :finish
      t.string :color
      t.string :location
      t.string :dimensions
      t.string :link
      t.string :image_url
      t.string :source_url
      t.text :attributes_text
      t.text :nested_products
      t.text :notes

      t.timestamps
    end

    add_index :spec_items, [:bid_package_id, :spec_item_id], unique: true
    add_index :spec_items, [:bid_package_id, :sku]
  end
end
