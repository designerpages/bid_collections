class SpecItemRequirementApproval < ApplicationRecord
  belongs_to :bid_package
  belongs_to :spec_item
  belongs_to :bid, optional: true
  belongs_to :component, class_name: 'SpecItemApprovalComponent', optional: true, inverse_of: :spec_item_requirement_approvals

  enum status: { pending: 0, approved: 1, needs_revision: 2 }

  validates :requirement_key, presence: true
  validates :approved_at, presence: true, if: :approved?
  validates :requirement_key, uniqueness: { scope: [:spec_item_id, :bid_id, :component_id] }

  def needs_fix_dates_array
    value = self[:needs_fix_dates]
    return value if value.is_a?(Array)
    return [] if value.blank?

    Array(value)
  rescue NoMethodError
    []
  end

  def action_history_array
    value = self[:action_history]
    return value if value.is_a?(Array)
    return [] if value.blank?

    Array(value)
  rescue NoMethodError
    []
  end
end
