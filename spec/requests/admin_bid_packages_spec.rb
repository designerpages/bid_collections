require 'rails_helper'

RSpec.describe 'Admin Bid Packages API', type: :request do
  describe 'POST /api/projects/:id/bid_packages/preview' do
    let!(:project) { Project.create!(name: 'Campus Modernization') }

    it 'previews a valid CSV payload' do
      csv = <<~CSV
        category,manufacturer,product_name,sku,description,quantity,uom
        Seating,Acme,Task Chair,CH-100,Mesh back task chair,25,EA
      CSV

      post "/api/projects/#{project.id}/bid_packages/preview",
           params: { csv_content: csv }.to_json,
           headers: { 'CONTENT_TYPE' => 'application/json' }

      expect(response).to have_http_status(:ok)
      expect(json_response['valid']).to eq(true)
      expect(json_response['row_count']).to eq(1)
    end

    it 'supports Designer Pages-style header aliases' do
      csv = <<~CSV
        Product ID,Code,Product Name,Image URL,DP URL,Brand,DP Categories,Notes,Description,Attributes,Nested Products
        14056889,*CL-1,INTELLECT WAVE,https://content.designerpages.com/assets/82412733/Wavechaircant15.jpg,http://designerpages.com/manufacturers/ki,KI,CHAIR - LEARNING,,Cantilever chair,Model #: IWC18CHPEVNG,Everglade Shade - KI|Chrome - KI
      CSV

      post "/api/projects/#{project.id}/bid_packages/preview",
           params: { csv_content: csv }.to_json,
           headers: { 'CONTENT_TYPE' => 'application/json' }

      expect(response).to have_http_status(:ok)
      expect(json_response['valid']).to eq(true)
      expect(json_response['source_profile']).to eq('designer_pages')
      expect(json_response['sample_rows'][0]['manufacturer']).to eq('KI')
      expect(json_response['sample_rows'][0]['quantity']).to be_nil
      expect(json_response['sample_rows'][0]['uom']).to eq('EA')
    end

    it 'skips blank Designer Pages rows and allows missing description' do
      csv = <<~CSV
        Product ID,Code,Product Name,Brand,DP Categories,Description
        14056889,*CL-1,INTELLECT WAVE,KI,CHAIR - LEARNING,
        ,,,,,
      CSV

      post "/api/projects/#{project.id}/bid_packages/preview",
           params: { csv_content: csv, source_profile: 'designer_pages' }.to_json,
           headers: { 'CONTENT_TYPE' => 'application/json' }

      expect(response).to have_http_status(:ok)
      expect(json_response['valid']).to eq(true)
      expect(json_response['row_count']).to eq(1)
      expect(json_response['sample_rows'][0]['description']).to eq('')
    end

    it 'keeps rows with product id even when other fields are missing' do
      csv = <<~CSV
        Product ID,Code,Product Name,Brand,DP Categories,Description
        14056889,,,,,
      CSV

      post "/api/projects/#{project.id}/bid_packages/preview",
           params: { csv_content: csv, source_profile: 'designer_pages' }.to_json,
           headers: { 'CONTENT_TYPE' => 'application/json' }

      expect(response).to have_http_status(:ok)
      expect(json_response['valid']).to eq(true)
      expect(json_response['row_count']).to eq(1)
      row = json_response['sample_rows'][0]
      expect(row['spec_item_id']).to eq('14056889')
      expect(row['sku']).to eq('14056889')
      expect(row['product_name']).to eq('Product 14056889')
      expect(row['manufacturer']).to eq('Unknown')
      expect(row['category']).to eq('Uncategorized')
    end

    it 'deduplicates duplicate product ids in designer pages profile' do
      csv = <<~CSV
        Product ID,Code,Product Name,Brand,DP Categories,Description
        14056889,*CL-1,INTELLECT WAVE,KI,CHAIR - LEARNING,Chair
        14056889,*CL-2,INTELLECT WAVE 2,KI,CHAIR - LEARNING,Chair 2
      CSV

      post "/api/projects/#{project.id}/bid_packages/preview",
           params: { csv_content: csv, source_profile: 'designer_pages' }.to_json,
           headers: { 'CONTENT_TYPE' => 'application/json' }

      expect(response).to have_http_status(:ok)
      expect(json_response['valid']).to eq(true)
      ids = json_response['sample_rows'].map { |row| row['spec_item_id'] }
      expect(ids).to eq(%w[14056889 14056889-2])
    end

    it 'returns validation errors for malformed rows' do
      csv = <<~CSV
        category,manufacturer,product_name,sku,description,quantity,uom
        Seating,Acme,Task Chair,CH-100,Mesh back task chair,not-a-number,EA
      CSV

      post "/api/projects/#{project.id}/bid_packages/preview",
           params: { csv_content: csv }.to_json,
           headers: { 'CONTENT_TYPE' => 'application/json' }

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json_response['errors'].join).to include('quantity must be numeric and >= 0')
    end
  end

  describe 'POST /api/projects/:id/bid_packages' do
    let!(:project) { Project.create!(name: 'Campus Modernization') }

    it 'imports a valid CSV payload' do
      csv = <<~CSV
        category,manufacturer,product_name,sku,description,quantity,uom
        Seating,Acme,Task Chair,CH-100,Mesh back task chair,25,EA
      CSV

      post "/api/projects/#{project.id}/bid_packages",
           params: {
             name: 'Furniture Package A',
             source_filename: 'spec_export.csv',
             csv_content: csv
           }.to_json,
           headers: { 'CONTENT_TYPE' => 'application/json' }

      expect(response).to have_http_status(:created)
      expect(json_response['imported_items_count']).to eq(1)
      expect(BidPackage.count).to eq(1)
      expect(SpecItem.count).to eq(1)
    end

    it 'returns validation errors for malformed rows' do
      csv = <<~CSV
        category,manufacturer,product_name,sku,description,quantity,uom
        Seating,Acme,Task Chair,CH-100,Mesh back task chair,not-a-number,EA
      CSV

      post "/api/projects/#{project.id}/bid_packages",
           params: {
             name: 'Bad Package',
             source_filename: 'bad.csv',
             csv_content: csv
           }.to_json,
           headers: { 'CONTENT_TYPE' => 'application/json' }

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json_response['errors'].join).to include('quantity must be numeric and >= 0')
    end
  end

  describe 'Awarding' do
    let!(:project) { Project.create!(name: 'Campus Modernization') }
    let!(:bid_package) do
      project.bid_packages.create!(name: 'Furniture Package A', source_filename: 'spec_export.csv', imported_at: Time.current)
    end
    let!(:invite_a) do
      bid_package.invites.create!(
        dealer_name: 'Dealer A',
        dealer_email: 'dealer-a@example.com',
        password: 'bidpass123',
        password_confirmation: 'bidpass123'
      )
    end
    let!(:invite_b) do
      bid_package.invites.create!(
        dealer_name: 'Dealer B',
        dealer_email: 'dealer-b@example.com',
        password: 'bidpass123',
        password_confirmation: 'bidpass123'
      )
    end
    let!(:spec_item) do
      bid_package.spec_items.create!(
        spec_item_id: 'S-BASE',
        category: 'Seating',
        manufacturer: 'Acme',
        product_name: 'Chair',
        sku: 'CH-BASE',
        description: 'Chair',
        quantity: 10,
        uom: 'EA'
      )
    end
    let!(:bid_a) do
      invite_a.create_bid!(state: :submitted, submitted_at: Time.current).tap do |bid|
        bid.bid_line_items.create!(spec_item: spec_item, unit_price: 1250)
        bid.bid_submission_versions.create!(
          version_number: 1,
          submitted_at: Time.current,
          total_amount: 12_500.25,
          line_items_snapshot: [{}]
        )
      end
    end
    let!(:bid_b) do
      invite_b.create_bid!(state: :submitted, submitted_at: Time.current).tap do |bid|
        bid.bid_line_items.create!(spec_item: spec_item, unit_price: 1145.075)
        bid.bid_submission_versions.create!(
          version_number: 1,
          submitted_at: Time.current,
          total_amount: 11_450.75,
          line_items_snapshot: [{}]
        )
      end
    end

    it 'awards one bid and marks other bids as not selected' do
      post "/api/bid_packages/#{bid_package.id}/award",
           params: {
             bid_id: bid_a.id,
             note: 'Best value',
             awarded_by: 'designer@example.com'
           }.to_json,
           headers: { 'CONTENT_TYPE' => 'application/json' }

      expect(response).to have_http_status(:ok)
      expect(bid_package.reload.awarded_bid_id).to eq(bid_a.id)
      expect(bid_package.package_award_status).to eq('fully_awarded')
      expect(bid_package.bid_row_awards.count).to eq(1)
      expect(bid_a.reload.selection_status).to eq('awarded')
      expect(bid_b.reload.selection_status).to eq('not_selected')
    end

    it 're-awards and retains award history' do
      post "/api/bid_packages/#{bid_package.id}/award",
           params: { bid_id: bid_a.id, awarded_by: 'designer@example.com' }.to_json,
           headers: { 'CONTENT_TYPE' => 'application/json' }

      patch "/api/bid_packages/#{bid_package.id}/change_award",
            params: {
              bid_id: bid_b.id,
              note: 'Updated scope',
              awarded_by: 'designer@example.com'
            }.to_json,
            headers: { 'CONTENT_TYPE' => 'application/json' }

      expect(response).to have_http_status(:ok)
      expect(bid_package.reload.awarded_bid_id).to eq(bid_b.id)
      expect(bid_package.bid_row_awards.pick(:bid_id)).to eq(bid_b.id)
      expect(bid_a.reload.selection_status).to eq('not_selected')
      expect(bid_b.reload.selection_status).to eq('awarded')
    end

    it 'can remove an existing award without reassigning' do
      post "/api/bid_packages/#{bid_package.id}/award",
           params: { bid_id: bid_a.id, awarded_by: 'designer@example.com' }.to_json,
           headers: { 'CONTENT_TYPE' => 'application/json' }

      patch "/api/bid_packages/#{bid_package.id}/clear_award",
            params: { note: 'Reopening bidding', awarded_by: 'designer@example.com' }.to_json,
            headers: { 'CONTENT_TYPE' => 'application/json' }

      expect(response).to have_http_status(:ok)
      expect(bid_package.reload.awarded_bid_id).to be_nil
      expect(bid_package.awarded_at).to be_nil
      expect(bid_package.bid_row_awards.count).to eq(0)
      expect(bid_package.package_award_status).to eq('not_awarded')
      expect(bid_a.reload.selection_status).to eq('pending')
      expect(bid_b.reload.selection_status).to eq('pending')
    end

    it 'commits row awards independently and derives partial package status' do
      second_item = bid_package.spec_items.create!(
        spec_item_id: 'S-ROW-2',
        category: 'Seating',
        manufacturer: 'Acme',
        product_name: 'Desk',
        sku: 'DK-1',
        description: 'Desk',
        quantity: 1,
        uom: 'EA'
      )
      bid_a.bid_line_items.create!(spec_item: second_item, unit_price: 900)
      bid_b.bid_line_items.create!(spec_item: second_item, unit_price: 850)

      patch "/api/bid_packages/#{bid_package.id}/award_rows",
            params: {
              selections: [
                {
                  spec_item_id: spec_item.id,
                  bid_id: bid_a.id,
                  price_source: 'bod',
                  unit_price_snapshot: '1250.0',
                  extended_price_snapshot: '12500.0'
                }
              ]
            }.to_json,
            headers: { 'CONTENT_TYPE' => 'application/json' }

      expect(response).to have_http_status(:ok)
      expect(bid_package.reload.package_award_status).to eq('partially_awarded')
      expect(bid_package.award_winner_scope).to eq('single_winner')
      expect(bid_package.awarded_bid_id).to be_nil
      expect(bid_package.bid_row_awards.count).to eq(1)
    end

    it 'approves a required line-item requirement with timestamp' do
      requirement_key = PostAward::RequiredApprovalsService.requirements_for_spec_item(
        bid_package.spec_items.create!(
          spec_item_id: 'S-01',
          category: 'Seating',
          manufacturer: 'Acme',
          product_name: 'Chair',
          sku: 'CH-1',
          description: 'Chair',
          quantity: 10,
          uom: 'EA'
        )
      ).first[:key]

      post "/api/bid_packages/#{bid_package.id}/award",
           params: { bid_id: bid_a.id, awarded_by: 'designer@example.com' }.to_json,
           headers: { 'CONTENT_TYPE' => 'application/json' }

      item = bid_package.spec_items.find_by!(spec_item_id: 'S-01')
      patch "/api/bid_packages/#{bid_package.id}/spec_items/#{item.id}/requirements/#{requirement_key}/approve",
            params: {}.to_json,
            headers: { 'CONTENT_TYPE' => 'application/json' }

      expect(response).to have_http_status(:ok)
      approval = SpecItemRequirementApproval.find_by(spec_item_id: item.id, requirement_key: requirement_key)
      expect(approval).to be_present
      expect(approval.status).to eq('approved')
      expect(approval.approved_at).to be_present
    end

    it 'tracks needs-fix timestamps and preserves history when later approved' do
      item = bid_package.spec_items.create!(
        spec_item_id: 'S-03',
        category: 'Seating',
        manufacturer: 'Acme',
        product_name: 'Bench',
        sku: 'BN-1',
        description: 'Bench',
        quantity: 2,
        uom: 'EA'
      )
      requirement_key = PostAward::RequiredApprovalsService.requirements_for_spec_item(item).first[:key]

      post "/api/bid_packages/#{bid_package.id}/award",
           params: { bid_id: bid_a.id, awarded_by: 'designer@example.com' }.to_json,
           headers: { 'CONTENT_TYPE' => 'application/json' }

      patch "/api/bid_packages/#{bid_package.id}/spec_items/#{item.id}/requirements/#{requirement_key}/needs_fix",
            params: {}.to_json,
            headers: { 'CONTENT_TYPE' => 'application/json' }
      expect(response).to have_http_status(:ok)

      patch "/api/bid_packages/#{bid_package.id}/spec_items/#{item.id}/requirements/#{requirement_key}/needs_fix",
            params: {}.to_json,
            headers: { 'CONTENT_TYPE' => 'application/json' }
      expect(response).to have_http_status(:ok)

      patch "/api/bid_packages/#{bid_package.id}/spec_items/#{item.id}/requirements/#{requirement_key}/approve",
            params: {}.to_json,
            headers: { 'CONTENT_TYPE' => 'application/json' }
      expect(response).to have_http_status(:ok)

      approval = SpecItemRequirementApproval.find_by(spec_item_id: item.id, requirement_key: requirement_key)
      expect(approval).to be_present
      expect(approval.status).to eq('approved')
      expect(approval.needs_fix_dates_array.length).to eq(2)
      expect(approval.approved_at).to be_present
    end

    it 'clears only approval date when unapproving an item with needs-fix history' do
      item = bid_package.spec_items.create!(
        spec_item_id: 'S-04',
        category: 'Seating',
        manufacturer: 'Acme',
        product_name: 'Task Chair',
        sku: 'TC-1',
        description: 'Task Chair',
        quantity: 8,
        uom: 'EA'
      )
      requirement_key = PostAward::RequiredApprovalsService.requirements_for_spec_item(item).first[:key]

      post "/api/bid_packages/#{bid_package.id}/award",
           params: { bid_id: bid_a.id, awarded_by: 'designer@example.com' }.to_json,
           headers: { 'CONTENT_TYPE' => 'application/json' }

      patch "/api/bid_packages/#{bid_package.id}/spec_items/#{item.id}/requirements/#{requirement_key}/needs_fix",
            params: {}.to_json,
            headers: { 'CONTENT_TYPE' => 'application/json' }
      expect(response).to have_http_status(:ok)

      patch "/api/bid_packages/#{bid_package.id}/spec_items/#{item.id}/requirements/#{requirement_key}/approve",
            params: {}.to_json,
            headers: { 'CONTENT_TYPE' => 'application/json' }
      expect(response).to have_http_status(:ok)

      patch "/api/bid_packages/#{bid_package.id}/spec_items/#{item.id}/requirements/#{requirement_key}/unapprove",
            params: {}.to_json,
            headers: { 'CONTENT_TYPE' => 'application/json' }
      expect(response).to have_http_status(:ok)

      approval = SpecItemRequirementApproval.find_by(spec_item_id: item.id, requirement_key: requirement_key)
      expect(approval).to be_present
      expect(approval.status).to eq('pending')
      expect(approval.approved_at).to be_nil
      expect(approval.needs_fix_dates_array.length).to eq(1)
      expect(approval.action_history_array.map { |event| event['action'] }).to include('needs_fix', 'approved', 'unapproved')
    end

    it 'records reset actions in approval history' do
      item = bid_package.spec_items.create!(
        spec_item_id: 'S-05',
        category: 'Seating',
        manufacturer: 'Acme',
        product_name: 'Stack Chair',
        sku: 'SC-1',
        description: 'Stack Chair',
        quantity: 12,
        uom: 'EA'
      )
      requirement_key = PostAward::RequiredApprovalsService.requirements_for_spec_item(item).first[:key]

      post "/api/bid_packages/#{bid_package.id}/award",
           params: { bid_id: bid_a.id, awarded_by: 'designer@example.com' }.to_json,
           headers: { 'CONTENT_TYPE' => 'application/json' }

      patch "/api/bid_packages/#{bid_package.id}/spec_items/#{item.id}/requirements/#{requirement_key}/needs_fix",
            params: {}.to_json,
            headers: { 'CONTENT_TYPE' => 'application/json' }
      expect(response).to have_http_status(:ok)

      patch "/api/bid_packages/#{bid_package.id}/spec_items/#{item.id}/requirements/#{requirement_key}/unapprove",
            params: { action_type: 'reset' }.to_json,
            headers: { 'CONTENT_TYPE' => 'application/json' }
      expect(response).to have_http_status(:ok)

      approval = SpecItemRequirementApproval.find_by(spec_item_id: item.id, requirement_key: requirement_key)
      expect(approval).to be_present
      expect(approval.status).to eq('pending')
      expect(approval.action_history_array.map { |event| event['action'] }).to include('needs_fix', 'reset')
    end

    it 'supports sub-row approval ownership per requirement column' do
      item = bid_package.spec_items.create!(
        spec_item_id: 'S-055',
        category: 'Seating',
        manufacturer: 'Acme',
        product_name: 'Credenza',
        sku: 'CR-1',
        description: 'Credenza',
        quantity: 1,
        uom: 'EA'
      )
      requirement_keys = PostAward::RequiredApprovalsService.requirements_for_spec_item(item).first(2).map { |row| row[:key] }
      component_requirement = requirement_keys.first
      direct_requirement = requirement_keys.last

      post "/api/bid_packages/#{bid_package.id}/award",
           params: { bid_id: bid_a.id, awarded_by: 'designer@example.com' }.to_json,
           headers: { 'CONTENT_TYPE' => 'application/json' }

      patch "/api/bid_packages/#{bid_package.id}/spec_items/#{item.id}/requirements/#{component_requirement}/approve",
            params: {}.to_json,
            headers: { 'CONTENT_TYPE' => 'application/json' }
      expect(response).to have_http_status(:ok)

      post "/api/bid_packages/#{bid_package.id}/spec_items/#{item.id}/approval_components",
           params: { label: 'Top' }.to_json,
           headers: { 'CONTENT_TYPE' => 'application/json' }
      expect(response).to have_http_status(:created)
      component_id = json_response.dig('component', 'id')

      patch "/api/bid_packages/#{bid_package.id}/spec_items/#{item.id}/approval_components/#{component_id}/requirements/#{component_requirement}/activate",
            params: {}.to_json,
            headers: { 'CONTENT_TYPE' => 'application/json' }
      expect(response).to have_http_status(:ok)
      expect(
        SpecItemRequirementApproval.where(
          spec_item_id: item.id,
          requirement_key: component_requirement,
          component_id: nil,
          bid_id: bid_a.id
        )
      ).to be_empty

      patch "/api/bid_packages/#{bid_package.id}/spec_items/#{item.id}/requirements/#{component_requirement}/approve",
            params: { component_id: component_id }.to_json,
            headers: { 'CONTENT_TYPE' => 'application/json' }
      expect(response).to have_http_status(:ok)

      patch "/api/bid_packages/#{bid_package.id}/spec_items/#{item.id}/requirements/#{direct_requirement}/approve",
            params: {}.to_json,
            headers: { 'CONTENT_TYPE' => 'application/json' }
      expect(response).to have_http_status(:ok)

      get "/api/bid_packages/#{bid_package.id}/dashboard"
      expect(response).to have_http_status(:ok)

      dashboard_item = json_response['spec_items'].find { |entry| entry['id'] == item.id }
      component_requirement_payload = dashboard_item['required_approvals'].find { |entry| entry['key'] == component_requirement }
      direct_requirement_payload = dashboard_item['required_approvals'].find { |entry| entry['key'] == direct_requirement }
      component_payload = dashboard_item['approval_components'].find { |entry| entry['id'] == component_id }
      component_cell = component_payload['required_approvals'].find { |entry| entry['key'] == component_requirement }

      expect(component_requirement_payload['ownership']).to eq('components')
      expect(component_requirement_payload['status']).to eq('approved')
      expect(direct_requirement_payload['ownership']).to eq('parent')
      expect(direct_requirement_payload['status']).to eq('approved')
      expect(component_cell['ownership']).to eq('component')
      expect(component_cell['status']).to eq('approved')
    end

    it 'exports approval matrix and audit in awarded mode' do
      item = bid_package.spec_items.create!(
        spec_item_id: 'S-06',
        category: 'Seating',
        manufacturer: 'Acme',
        product_name: 'Lounge Chair',
        sku: 'LC-1',
        description: 'Lounge Chair',
        quantity: 3,
        uom: 'EA'
      )
      requirement_key = PostAward::RequiredApprovalsService.requirements_for_spec_item(item).first[:key]

      post "/api/bid_packages/#{bid_package.id}/award",
           params: { bid_id: bid_a.id, awarded_by: 'designer@example.com' }.to_json,
           headers: { 'CONTENT_TYPE' => 'application/json' }

      patch "/api/bid_packages/#{bid_package.id}/spec_items/#{item.id}/requirements/#{requirement_key}/needs_fix",
            params: {}.to_json,
            headers: { 'CONTENT_TYPE' => 'application/json' }
      patch "/api/bid_packages/#{bid_package.id}/spec_items/#{item.id}/requirements/#{requirement_key}/approve",
            params: {}.to_json,
            headers: { 'CONTENT_TYPE' => 'application/json' }
      patch "/api/bid_packages/#{bid_package.id}/spec_items/#{item.id}/requirements/#{requirement_key}/unapprove",
            params: { action_type: 'reset' }.to_json,
            headers: { 'CONTENT_TYPE' => 'application/json' }

      get "/api/bid_packages/#{bid_package.id}/export.csv",
          params: { export_type: 'approval_matrix' }
      expect(response).to have_http_status(:ok)
      expect(response.media_type).to eq('text/csv')
      expect(response.body).to include('Code/Tag')
      expect(response.body).to include('LC-1')

      get "/api/bid_packages/#{bid_package.id}/export.csv",
          params: { export_type: 'approval_audit' }
      expect(response).to have_http_status(:ok)
      expect(response.media_type).to eq('text/csv')
      expect(response.body).to include('Action Date')
      expect(response.body).to include('Reset')
    end

    it 'allows admin to upload and delete designer post-award files for a line item' do
      item = bid_package.spec_items.create!(
        spec_item_id: 'S-07',
        category: 'Seating',
        manufacturer: 'Acme',
        product_name: 'Marker Board',
        sku: 'MB-1',
        description: 'Marker Board',
        quantity: 1,
        uom: 'EA'
      )

      post "/api/bid_packages/#{bid_package.id}/award",
           params: { bid_id: bid_a.id, awarded_by: 'designer@example.com' }.to_json,
           headers: { 'CONTENT_TYPE' => 'application/json' }

      post "/api/bid_packages/#{bid_package.id}/post_award_uploads",
           params: {
             spec_item_id: item.id,
             file_name: 'designer-note.pdf',
             note: 'Please review dimensions'
           }.to_json,
           headers: { 'CONTENT_TYPE' => 'application/json' }

      expect(response).to have_http_status(:created)
      upload_id = json_response.dig('upload', 'id')
      expect(upload_id).to be_present

      delete "/api/bid_packages/#{bid_package.id}/post_award_uploads/#{upload_id}"
      expect(response).to have_http_status(:ok)
      expect(PostAwardUpload.find_by(id: upload_id)).to be_nil
    end

    it 'clears approvals only for the currently awarded vendor' do
      item = bid_package.spec_items.create!(
        spec_item_id: 'S-02',
        category: 'Seating',
        manufacturer: 'Acme',
        product_name: 'Stool',
        sku: 'ST-1',
        description: 'Stool',
        quantity: 5,
        uom: 'EA'
      )
      requirement_key = PostAward::RequiredApprovalsService.requirements_for_spec_item(item).first[:key]

      post "/api/bid_packages/#{bid_package.id}/award",
           params: { bid_id: bid_a.id, awarded_by: 'designer@example.com' }.to_json,
           headers: { 'CONTENT_TYPE' => 'application/json' }

      patch "/api/bid_packages/#{bid_package.id}/spec_items/#{item.id}/requirements/#{requirement_key}/approve",
            params: {}.to_json,
            headers: { 'CONTENT_TYPE' => 'application/json' }

      patch "/api/bid_packages/#{bid_package.id}/change_award",
            params: { bid_id: bid_b.id, awarded_by: 'designer@example.com' }.to_json,
            headers: { 'CONTENT_TYPE' => 'application/json' }

      patch "/api/bid_packages/#{bid_package.id}/clear_current_award_approvals",
            params: {}.to_json,
            headers: { 'CONTENT_TYPE' => 'application/json' }

      expect(response).to have_http_status(:ok)
      expect(SpecItemRequirementApproval.where(bid_id: bid_a.id).count).to eq(1)
      expect(SpecItemRequirementApproval.where(bid_id: bid_b.id).count).to eq(0)
    end
  end
end
