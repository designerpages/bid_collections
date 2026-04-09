class SpecItemApprovalComponent < ApplicationRecord
  belongs_to :bid_package
  belongs_to :spec_item

  has_many :spec_item_requirement_approvals, dependent: :destroy, foreign_key: :component_id, inverse_of: :component

  validates :label, presence: true
  validates :position, numericality: { greater_than_or_equal_to: 0 }, allow_nil: true
end
