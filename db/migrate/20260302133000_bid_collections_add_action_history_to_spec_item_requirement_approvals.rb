class BidCollectionsAddActionHistoryToSpecItemRequirementApprovals < ActiveRecord::Migration[5.2]
  def up
    add_column :spec_item_requirement_approvals, :action_history, :json

    execute <<~SQL.squish
      UPDATE spec_item_requirement_approvals
      SET action_history = JSON_ARRAY()
      WHERE action_history IS NULL
    SQL

    change_column_null :spec_item_requirement_approvals, :action_history, false
  end

  def down
    remove_column :spec_item_requirement_approvals, :action_history
  end
end
