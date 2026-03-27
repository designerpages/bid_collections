class BidCollectionsChangeLeadTimeDaysToString < ActiveRecord::Migration[5.2]
  def change
    change_column :bid_line_items, :lead_time_days, :string
  end
end
