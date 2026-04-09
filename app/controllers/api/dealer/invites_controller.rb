module Api
  module Dealer
    class InvitesController < Api::Dealer::BaseController
      def show
        bid_package = @invite.bid_package
        render json: {
          invite: {
            dealer_name: @invite.dealer_name,
            project_name: bid_package.project&.name,
            bid_package_name: bid_package.name,
            disabled: @invite.disabled?,
            unlocked: unlocked_for_invite?
          }
        }
      end

      def unlock
        password = params.require(:password)
        if @invite.authenticate(password)
          @invite.update!(last_unlocked_at: Time.current)
          mark_unlocked!
          render json: { unlocked: true }
        else
          render json: { error: 'Invalid password' }, status: :unauthorized
        end
      rescue BCrypt::Errors::InvalidHash
        render json: { error: 'Invalid password' }, status: :unauthorized
      end
    end
  end
end
