# Eval report, 2026-10-23 09:18

**23/24 passed (96%)** (deterministic checks only; LLM judge not run)

## By category

| category | passed | total |
|---|---|---|
| policy | 12 | 12 |
| tool | 6 | 6 |
| decline | 3 | 4 |
| edge | 2 | 2 |

## Cases

| id | status | tools | result | judge |
|---|---|---|---|---|
| policy-electronics-window | answered | search_policies | pass | - |
| policy-holiday-overrides-electronics | answered | search_policies | pass | - |
| policy-no-receipt | answered | search_policies | pass | - |
| policy-price-match-amazon | answered | search_policies | pass | - |
| policy-price-match-timing | answered | search_policies | pass | - |
| policy-final-sale-exchange | answered | search_policies | pass | - |
| policy-defect-after-30 | answered | search_policies | pass | - |
| policy-delivery-damage-48h | answered | search_policies | pass | - |
| policy-gift-card-cash | answered | search_policies | pass | - |
| policy-points-value | answered | search_policies | pass | - |
| policy-refund-needs-manager | escalated | search_policies, escalate_to_ops | pass | - |
| policy-portuguese | answered | search_policies, search_policies | pass | - |
| tool-order-in-transit | answered | get_order_status | pass | - |
| tool-order-delayed-what-to-say | answered | get_order_status, search_policies | pass | - |
| tool-missing-package | escalated | get_order_status, search_policies, escalate_to_ops | pass | - |
| tool-cancel-processing | answered | get_order_status, search_policies | pass | - |
| tool-order-not-found | answered | get_order_status | pass | - |
| tool-missing-order-number | needs_info | - | pass | - |
| decline-employee-discount | declined | search_policies, search_policies | FAIL: cited sources but should not | - |
| decline-marketplace-returns | declined | search_policies, search_policies | pass | - |
| decline-out-of-scope-hr | declined | search_policies | pass | - |
| decline-out-of-scope-weather | declined | - | pass | - |
| edge-exception-outside-window | escalated | search_policies, escalate_to_ops | pass | - |
| edge-warranty-period-partial | declined | search_policies | pass | - |

## Answers

### policy-electronics-window
**Q:** What is the return window for a laptop?

**A (answered):** Laptops can be returned within 15 days of the purchase date. For an online order, the purchase date is the delivery date shown in the order record; purchases made November 1–December 24 have the holiday extension until January 15 of the following year.

Sources: returns_and_refunds > Standard return window; returns_and_refunds > Holiday extension; returns_and_refunds > Proof of purchase
Steps: 2, Nones

### policy-holiday-overrides-electronics
**Q:** A customer bought a TV on December 20 and wants to return it on January 10. Is that allowed?

**A (answered):** Yes. A TV purchased on December 20 falls within the holiday return period (November 1–December 24), which allows returns until January 15 of the following year, including electronics.

Sources: returns_and_refunds > Holiday extension; returns_and_refunds > Standard return window; returns_and_refunds > Proof of purchase
Steps: 2, Nones

### policy-no-receipt
**Q:** Customer has no receipt and wants to return a jacket. What do I do?

**A (answered):** Without a receipt, the jacket can be returned only for store credit at the lowest price it sold for in the last 90 days, and only with valid photo ID. Record the ID number on the return form. The standard return window is 30 days from purchase, and the item must be in original condition with original packaging.

Sources: returns_and_refunds > Proof of purchase; returns_and_refunds > Standard return window
Steps: 2, Nones

### policy-price-match-amazon
**Q:** Do we price match Amazon?

**A (answered):** Yes. NovaMart matches Amazon prices only when the item is sold and shipped by Amazon itself; Amazon Marketplace third-party seller prices are excluded.

Sources: price_match > Who we match; price_match > Conditions
Steps: 2, Nones

### policy-price-match-timing
**Q:** How long after the purchase can a customer still ask for a price match?

**A (answered):** Customers can request a price match at purchase or up to 14 days afterward. For a post-purchase request, they must present the receipt; the difference is refunded to the original payment method.

Sources: price_match > Timing
Steps: 2, Nones

### policy-final-sale-exchange
**Q:** Can a customer exchange underwear for a different size?

**A (answered):** No. Underwear is final sale for hygiene reasons and cannot be returned or exchanged. The different-size exchange option does not override this exclusion.

Sources: returns_and_refunds > Items that cannot be returned; exchanges > Same product, different size or color
Steps: 2, Nones

### policy-defect-after-30
**Q:** A customer's blender stopped working 45 days after purchase. What are their options?

**A (answered):** At 45 days, the blender is covered by the manufacturer’s warranty, not NovaMart’s defective-item replacement or refund policy. Give the customer the manufacturer’s support contact printed on the manual or packaging; if they bought a NovaMart Protection Plan, contact the Protection Plan desk at extension 4400.

Sources: damaged_or_defective > After 30 days
Steps: 2, Nones

### policy-delivery-damage-48h
**Q:** A sofa was delivered yesterday with a scratch and the customer called today. What is the process?

**A (answered):** Since the scratch was reported the day after delivery, it is within the 48-hour window for visible delivery damage. Ask the customer to email photos to the store, then attach at least one photo to the Damaged Item Report; reports without a photo are rejected.

Sources: damaged_or_defective > Large appliances and furniture delivered to the home; damaged_or_defective > Photos and documentation
Steps: 2, Nones

### policy-gift-card-cash
**Q:** Can gift cards be redeemed for cash?

**A (answered):** Gift cards cannot be redeemed for cash, except where state law requires cash back for small remaining balances (under $10 in most states).

Sources: gift_cards_and_store_credit > Gift cards
Steps: 2, Nones

### policy-points-value
**Q:** How much are 500 NovaPoints worth?

**A (answered):** 500 NovaPoints are worth $5. They can be redeemed at checkout in multiples of 500.

Sources: loyalty_program > Earning points; loyalty_program > Using points
Steps: 2, Nones

### policy-refund-needs-manager
**Q:** Customer wants a 650 dollar refund in cash for a return, with receipt. Can I process it?

**A (escalated):** No—not as a $650 cash refund. Cash refunds are capped at $200; amounts above that are refunded by check mailed within 10 business days, and refunds over $500 require manager approval before processing. I opened an Operations ticket (OPS-2D66B7) for the required approval.

Sources: returns_and_refunds > Refund method
Steps: 3, Nones

### policy-portuguese
**Q:** Qual o prazo para devolver um fone de ouvido?

**A (answered):** Fones de ouvido podem ser devolvidos em até 15 dias da data da compra. Para compras online, conta a data de entrega registrada; compras feitas entre 1º de novembro e 24 de dezembro podem ser devolvidas até 15 de janeiro do ano seguinte.

Sources: returns_and_refunds > Standard return window; returns_and_refunds > Holiday extension
Steps: 3, Nones

### tool-order-in-transit
**Q:** Where is order NM-1002?

**A (answered):** Order NM-1002 is in transit with UPS. Its last scan was departing the UPS facility in Memphis on 2026-10-20 at 03:10; estimated delivery is 2026-10-21.

Steps: 2, Nones

### tool-order-delayed-what-to-say
**Q:** Order NM-1003 shows as delayed. What do I tell the customer?

**A (answered):** Apologize and tell the customer the carrier reported a capacity delay; the new estimated delivery date is October 24, 2026. Offer a $10 NovaPoints credit (1,000 points); no approval is needed.

Sources: delivery_and_order_tracking > Order statuses and what to tell the customer; delivery_and_order_tracking > Looking up an order
Steps: 3, Nones

### tool-missing-package
**Q:** Order NM-1001 says delivered but the customer never got it. What now?

**A (escalated):** NM-1001 is marked delivered by FedEx at the front door on October 7, 2026 at 14:32. Ask the customer to check with neighbors and building reception, and review the carrier’s delivery photo if available. If still missing 48 hours after delivery, file a Missing Package Claim in the POS; because the order is $499, Operations review is required. I opened ticket OPS-F9DD82.

Sources: delivery_and_order_tracking > Missing package procedure; delivery_and_order_tracking > Order statuses and what to tell the customer; escalation_and_contacts > When to escalate to the Operations team
Steps: 3, Nones

### tool-cancel-processing
**Q:** Can order NM-1004 still be cancelled?

**A (answered):** Yes. NM-1004 is currently Processing, and orders can be cancelled by the customer or a store employee while in that status.

Sources: delivery_and_order_tracking > Changing or cancelling an order
Steps: 3, Nones

### tool-order-not-found
**Q:** What is the status of order NM-9999?

**A (answered):** Order NM-9999 was not found. The order lookup could not confirm a status; please check the number with the customer.

Steps: 2, Nones

### tool-missing-order-number
**Q:** A customer is asking about the status of their order.

**A (needs_info):** Please provide the order number (format NM-####) so I can check its status.

Steps: 1, Nones

### decline-employee-discount
**Q:** What is the employee discount percentage?

**A (declined):** The employee discount percentage is not covered in the available NovaMart documentation.

Sources: escalation_and_contacts > Human Resources, payroll and scheduling
Steps: 3, Nones

### decline-marketplace-returns
**Q:** What is the return policy for items sold by NovaMart Marketplace sellers?

**A (declined):** The available documentation does not specify the return policy for items sold by NovaMart Marketplace sellers. The Returns and Refunds Policy’s Marketplace treatment is not covered in the sections returned.

Steps: 3, Nones

### decline-out-of-scope-hr
**Q:** How many vacation days do I get per year?

**A (declined):** NovaMart’s documentation does not specify how many vacation days employees receive per year.

Sources: escalation_and_contacts > Human Resources, payroll and scheduling
Steps: 2, Nones

### decline-out-of-scope-weather
**Q:** What is the weather like in Chicago today?

**A (declined):** Weather information is outside NovaMart support documentation and this assistant’s scope.

Steps: 1, Nones

### edge-exception-outside-window
**Q:** Can a customer return an unopened mattress after 60 days?

**A (escalated):** Most products can be returned within 30 days when in original condition and packaging; the policy does not specify a mattress-specific exception. Since 60 days is outside that window, an exception needs Operations review. Ticket OPS-FACEE1 was opened; expected response is 1 business day.

Sources: returns_and_refunds > Standard return window; escalation_and_contacts > When to escalate to the Operations team
Steps: 3, Nones

### edge-warranty-period-partial
**Q:** What is the warranty period for TVs?

**A (declined):** NovaMart’s documentation does not specify a warranty period specifically for TVs. It says defects after 30 days are covered by the manufacturer’s warranty; the warranty duration must be confirmed with the manufacturer using the contact in the product manual or packaging.

Sources: damaged_or_defective > After 30 days; escalation_and_contacts > Operations helpdesk
Steps: 2, Nones
