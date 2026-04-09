class SpecItem < ApplicationRecord
  belongs_to :bid_package

  has_one :bid_row_award, dependent: :destroy
  has_many :bid_line_items, dependent: :destroy
  has_many :spec_item_approval_components, dependent: :destroy
  has_many :spec_item_requirement_approvals, dependent: :destroy
  has_many :post_award_uploads, dependent: :destroy

  scope :active, -> { where(active: true) }

  validates :spec_item_id, :category, :manufacturer, :product_name,
            :uom, presence: true
  validates :quantity, numericality: { greater_than_or_equal_to: 0 }, allow_nil: true
  validates :spec_item_id, uniqueness: { scope: :bid_package_id }
end
