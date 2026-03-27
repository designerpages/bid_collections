class BidCollectionsCreateProjects < ActiveRecord::Migration[5.2]
  def change
    return if table_exists?(:projects)

    create_table :projects do |t|
      t.string :name, null: false
      t.text :description

      t.timestamps
    end
  end
end
