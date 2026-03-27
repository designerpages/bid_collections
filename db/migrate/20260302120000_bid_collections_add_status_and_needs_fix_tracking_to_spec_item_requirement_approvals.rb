class BidCollectionsAddStatusAndNeedsFixTrackingToSpecItemRequirementApprovals < ActiveRecord::Migration[5.2]
  def up
    add_column :spec_item_requirement_approvals, :status, :integer, null: false, default: 0
    add_column :spec_item_requirement_approvals, :needs_fix_dates, :json
    change_column_null :spec_item_requirement_approvals, :approved_at, true

    execute <<~SQL.squish
      UPDATE spec_item_requirement_approvals
      SET needs_fix_dates = JSON_ARRAY()
      WHERE needs_fix_dates IS NULL
    SQL

    execute <<~SQL.squish
      UPDATE spec_item_requirement_approvals
      SET status = 1
      WHERE approved_at IS NOT NULL
    SQL

    change_column_null :spec_item_requirement_approvals, :needs_fix_dates, false
  end

  def down
    remove_column :spec_item_requirement_approvals, :needs_fix_dates
    remove_column :spec_item_requirement_approvals, :status
    change_column_null :spec_item_requirement_approvals, :approved_at, false
  end
end
