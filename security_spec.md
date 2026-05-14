# Security Specification - POS/ERP System

## 1. Data Invariants
- Every sale must be linked to a valid user (`userId`).
- Inventory movements must track `previousStock` and `newStock` for audit.
- Products must belong to a category.
- Pending sales are shared across the team (all signed-in users) but tracked by `userId`.

## 2. Access Control Strategy
- **Authentication**: All users must be signed in via Google.
- **Identity**: `request.auth.uid` must match `userId` for personal data (expenses, sales ownership).
- **Public/Shared Data**: Products, Categories, Suppliers, Customers, and Pending Sales are readable and writable by any authenticated user to ensure smooth ERP operations as requested.
- **Admin Override**: `djelloulmohamed1990@gmail.com` and users with `role == 'admin'` have full override permissions.

## 3. Implementation Plan
- Update `isAdmin()` to be more robust.
- Open up `write` permissions for `categories`, `suppliers`, `customers`, and `products` to all `isSignedIn()` users, while keeping validation helpers.
- Ensure `pending_sales` is fully CRUDable by any signed-in user.
- Add `settings` and `invoices` placeholders.

## 4. The "Dirty Dozen" (Payload Test Cases)
1. Unauthenticated write to `products` -> FAIL.
2. Authenticated user setting `userId` to another UID in `sales` -> FAIL.
3. Updating immutable `createdAt` field in `products` -> FAIL.
4. Deleting a `sale` record -> FAIL (Sales are immutable/audit-only).
5. Injecting a 1MB string into `customer.name` -> FAIL.
6. Creating a `user` profile with `role: 'admin'` as a normal user -> FAIL.
7. Updating stock without specifying a `number` type -> FAIL.
8. Removing `items` list from a `sale` during creation -> FAIL.
9. Creating a pending sale without being signed in -> FAIL.
10. Modifying `totalSpent` of a customer to a negative number -> FAIL.
11. Bypassing validation with extra fields not in schema -> FAIL (via strict schema).
12. Scanning for users list as a non-admin -> FAIL.
