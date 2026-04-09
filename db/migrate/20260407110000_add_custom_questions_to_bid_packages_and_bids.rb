class AddCustomQuestionsToBidPackagesAndBids < ActiveRecord::Migration[5.2]
  def change
    add_column :bid_packages, :custom_questions, :json
    add_column :bids, :custom_question_responses, :json
  end
end
