require 'rails_helper'

RSpec.describe 'Dealer Bid Flow API', type: :request do
  let!(:project) { Project.create!(name: 'Hotel Tower') }
  let!(:bid_package) do
    project.bid_packages.create!(name: 'Lighting', source_filename: 'lighting.csv', imported_at: Time.current)
  end
  let!(:spec_item) do
    bid_package.spec_items.create!(
      spec_item_id: 'L-01',
      category: 'Lighting',
      manufacturer: 'Lumina',
      product_name: 'Pendant',
      sku: 'PND-100',
      description: 'Pendant light',
      quantity: 10,
      uom: 'EA'
    )
  end
  let!(:invite) do
    bid_package.invites.create!(
      dealer_name: 'Dealer A',
      dealer_email: 'dealer@example.com',
      password: 'bidpass123',
      password_confirmation: 'bidpass123'
    )
  end

  it 'unlocks, saves draft, submits, and prevents post-submit edits' do
    post "/api/invites/#{invite.token}/unlock",
         params: { password: 'bidpass123' }.to_json,
         headers: { 'CONTENT_TYPE' => 'application/json' }

    expect(response).to have_http_status(:ok)

    put "/api/invites/#{invite.token}/bid",
        params: {
          line_items: [
            {
              spec_item_id: spec_item.id,
              unit_price: '145.5000',
              discount_percent: '10.0',
              tariff_percent: '5.0',
              lead_time_days: 14,
              dealer_notes: 'Available in stock finishes only'
            }
          ],
          pricing: {
            delivery_amount: '150.00',
            install_amount: '250.00',
            escalation_amount: '75.00',
            contingency_amount: '50.00',
            sales_tax_amount: '120.00'
          }
        }.to_json,
        headers: { 'CONTENT_TYPE' => 'application/json' }

    expect(response).to have_http_status(:ok)
    expect(invite.reload.bid.bid_line_items.first.discount_percent.to_s).to eq('10.0')
    expect(invite.reload.bid.bid_line_items.first.tariff_percent.to_s).to eq('5.0')
    expect(invite.bid.delivery_amount.to_s).to eq('150.0')
    expect(invite.bid.install_amount.to_s).to eq('250.0')
    expect(invite.bid.escalation_amount.to_s).to eq('75.0')
    expect(invite.bid.contingency_amount.to_s).to eq('50.0')

    post "/api/invites/#{invite.token}/bid/submit",
         headers: { 'CONTENT_TYPE' => 'application/json' }

    expect(response).to have_http_status(:ok)
    expect(invite.reload.bid.bid_submission_versions.count).to eq(1)
    snapshot_row = invite.bid.bid_submission_versions.first.line_items_snapshot.first
    expect(snapshot_row['unit_net_price']).to be_present

    put "/api/invites/#{invite.token}/bid",
        params: {
          line_items: [
            {
              spec_item_id: spec_item.id,
              unit_price: '130.0000'
            }
          ]
        }.to_json,
        headers: { 'CONTENT_TYPE' => 'application/json' }

    expect(response).to have_http_status(:conflict)
  end

  it 'rejects substitution rows without a unit price' do
    post "/api/invites/#{invite.token}/unlock",
         params: { password: 'bidpass123' }.to_json,
         headers: { 'CONTENT_TYPE' => 'application/json' }

    expect(response).to have_http_status(:ok)

    put "/api/invites/#{invite.token}/bid",
        params: {
          line_items: [
            {
              spec_item_id: spec_item.id,
              is_substitution: false,
              unit_price: '120.00'
            },
            {
              spec_item_id: spec_item.id,
              is_substitution: true,
              substitution_product_name: 'Pendant Alt',
              substitution_brand_name: 'Alt Brand',
              unit_price: ''
            }
          ]
        }.to_json,
        headers: { 'CONTENT_TYPE' => 'application/json' }

    expect(response).to have_http_status(:unprocessable_entity)
    expect(json_response['errors'].join(' ')).to include("Unit price can't be blank")
  end

  it 'locks bid updates after package is awarded' do
    bid = invite.create_bid!(state: :submitted, submitted_at: Time.current)
    bid_package.update!(awarded_bid: bid, awarded_at: Time.current)

    post "/api/invites/#{invite.token}/unlock",
         params: { password: 'bidpass123' }.to_json,
         headers: { 'CONTENT_TYPE' => 'application/json' }

    put "/api/invites/#{invite.token}/bid",
        params: {
          line_items: [
            {
              spec_item_id: spec_item.id,
              unit_price: '130.0000'
            }
          ]
        }.to_json,
        headers: { 'CONTENT_TYPE' => 'application/json' }

    expect(response).to have_http_status(:conflict)
  end

  it 'allows bidder to upload line-item files before award' do
    post "/api/invites/#{invite.token}/unlock",
         params: { password: 'bidpass123' }.to_json,
         headers: { 'CONTENT_TYPE' => 'application/json' }

    post "/api/invites/#{invite.token}/post_award_uploads",
         params: { file_name: 'shop-drawing.pdf', spec_item_id: spec_item.id }.to_json,
         headers: { 'CONTENT_TYPE' => 'application/json' }

    expect(response).to have_http_status(:created)
    expect(json_response.dig('upload', 'file_name')).to eq('shop-drawing.pdf')
    expect(PostAwardUpload.count).to eq(1)
  end

  it 'allows bidder to delete their uploaded file' do
    post "/api/invites/#{invite.token}/unlock",
         params: { password: 'bidpass123' }.to_json,
         headers: { 'CONTENT_TYPE' => 'application/json' }

    upload = bid_package.post_award_uploads.create!(
      invite: invite,
      spec_item: spec_item,
      uploader_role: :vendor,
      file_name: 'shop-drawing.pdf'
    )

    delete "/api/invites/#{invite.token}/post_award_uploads/#{upload.id}"

    expect(response).to have_http_status(:ok)
    expect(PostAwardUpload.find_by(id: upload.id)).to be_nil
  end
end
