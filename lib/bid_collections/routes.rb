module BidCollections
  module Routes
    def self.draw(router)
      router.namespace :api, defaults: { format: :json } do
        # Standalone-mode proxy to DP v2 bid_collections endpoints (browser-safe).
        # POST: firm_id + project_name (+ optional project_number). GET: firm_id + project_id (embed).
        router.match 'dp/context', to: 'dp_proxy#context', via: [:get, :post]
        router.get 'dp/projects/:project_id/bid_packages', to: 'dp_proxy#bid_packages'
        router.post 'dp/projects/:project_id/bid_packages/:package_id/selection', to: 'dp_proxy#selection'
        router.post 'dp/projects/:project_id/specs/batch', to: 'dp_proxy#specs_batch'

        # DP (DesignerPages / host app) integration endpoints.
        router.post :context, to: 'dp/context#create'
        router.get 'projects/:project_id/bid_packages', to: 'dp/bid_packages#index'
        router.post 'projects/:project_id/bid_packages/sync', to: 'dp/bid_packages#sync'
        router.get 'sync/:sync_id', to: 'dp/sync#show'

        router.scope module: :admin do
          router.resources :projects, only: [:index, :create, :destroy]

          router.resources :projects, only: [] do
            router.resources :bid_packages, only: [:create] do
              router.collection do
                router.post :preview
              end
            end
          end

          router.resources :bid_packages, only: [:index, :destroy, :update] do
            router.member do
              router.post :import_rows
              router.post :award
              router.patch :award_rows
              router.patch :clear_award_rows
              router.patch :clear_bidder_awards
              router.patch :change_award
              router.patch :clear_award
              router.patch :award_scope
              router.patch :clear_current_award_approvals
              router.get 'post_award_uploads/:upload_id/download', to: 'bid_packages#download_post_award_upload'
              router.get 'post_award_uploads/:upload_id/preview', to: 'bid_packages#preview_post_award_upload'
              router.get 'post_award_uploads/download_all', to: 'bid_packages#download_post_award_uploads_bundle'
              router.post :post_award_uploads, to: 'bid_packages#create_post_award_upload'
              router.patch 'post_award_uploads/:upload_id', to: 'bid_packages#update_post_award_upload'
              router.delete 'post_award_uploads/:upload_id', to: 'bid_packages#delete_post_award_upload'
              router.post 'spec_items/:spec_item_id/approval_components', to: 'bid_packages#create_spec_item_approval_component'
              router.patch 'spec_items/:spec_item_id/approval_components/:component_id', to: 'bid_packages#update_spec_item_approval_component'
              router.delete 'spec_items/:spec_item_id/approval_components/:component_id', to: 'bid_packages#delete_spec_item_approval_component'
              router.patch 'spec_items/:spec_item_id/approval_components/:component_id/requirements/:requirement_key/activate', to: 'bid_packages#activate_spec_item_component_requirement'
              router.patch 'spec_items/:spec_item_id/approval_components/:component_id/requirements/:requirement_key/deactivate', to: 'bid_packages#deactivate_spec_item_component_requirement'
              router.patch 'spec_items/:spec_item_id/requirements/:requirement_key/approve', to: 'bid_packages#approve_spec_item_requirement'
              router.patch 'spec_items/:spec_item_id/requirements/:requirement_key/needs_fix', to: 'bid_packages#mark_spec_item_requirement_needs_fix'
              router.patch 'spec_items/:spec_item_id/requirements/:requirement_key/unapprove', to: 'bid_packages#unapprove_spec_item_requirement'
              router.patch 'spec_items/:spec_item_id/deactivate', to: 'bid_packages#deactivate_spec_item'
              router.patch 'spec_items/:spec_item_id/reactivate', to: 'bid_packages#reactivate_spec_item'
            end

            router.resources :invites, only: [:create, :destroy] do
              router.collection do
                router.post :bulk_disable
                router.post :bulk_enable
                router.post :bulk_reopen
                router.post :bulk_destroy
              end

              router.member do
                router.get :history
                router.post :reopen
                router.post :reclose
                router.patch :password
                router.patch :disable
                router.patch :enable
              end
            end
            router.get :dashboard, to: 'dashboards#show'
            router.get :comparison, to: 'comparisons#show'
            router.post :comparison_analysis, to: 'comparisons#analysis'
            router.get :export, to: 'exports#show'
          end
        end

        router.scope module: :public do
          router.get 'public/bid_packages/:token', to: 'bid_packages#show'
        end

        router.scope module: :dealer do
          router.get 'invites/:token', to: 'invites#show'
          router.post 'invites/:token/unlock', to: 'invites#unlock'

          router.get 'invites/:token/bid', to: 'bids#show'
          router.put 'invites/:token/bid', to: 'bids#update'
          router.post 'invites/:token/bid/submit', to: 'bids#submit'
          router.post 'invites/:token/post_award_uploads', to: 'bids#create_post_award_upload'
          router.get 'invites/:token/post_award_uploads/:upload_id/download', to: 'bids#download_post_award_upload'
          router.delete 'invites/:token/post_award_uploads/:upload_id', to: 'bids#delete_post_award_upload'
        end
      end
    end
  end
end
