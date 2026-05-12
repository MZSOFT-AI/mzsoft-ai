# Spécification de Sécurité - ERP Pro

## 1. Invariants de Données
- Un **produit** doit avoir une quantité positive ou nulle.
- Une **vente** doit être attachée à l'UID de l'utilisateur qui l'a créée (`request.auth.uid`).
- Les **mouvements de stock** sont immuables (pas de suppression ni de modification, juste des nouveaux mouvements pour correction).
- Un utilisateur ne peut pas s'auto-assigner le rôle `admin`.

## 2. Payloads de Test (Dirty Dozen)
1.  **Identity Spoofing**: Tenter de créer une vente avec `userId` d'un autre utilisateur.
2.  **Privilege Escalation**: Un vendeur tente de passer son rôle à `admin` dans `/users/{uid}`.
3.  **Cross-Resource Poisoning**: Injection de code/scripts dans le champ `name` d'un produit (max 128 chars).
4.  **Orphaned Sale**: Créer une vente pour un produit qui n'existe pas.
5.  **Negative Stock**: Tenter de définir `stockQuantity` à -50 via l'API client.
6.  **Shadow Update**: Tenter d'ajouter un champ caché `isVip: true` à un profil client.
7.  **Terminal State Bypass**: Tenter de modifier une vente déjà marquée comme `completed`.
8.  **Price Tampering**: Tenter de modifier le `sellingPrice` d'un produit en tant que vendeur.
9.  **Denial of Wallet**: Envoyer un document de 1MB dans le champ `description`.
10. **Time Spoofing**: Envoyer un `createdAt` dans le passé au lieu du `request.time` du serveur.
11. **PII Leak**: Un vendeur tente de lister tous les documents de la collection `users` (sensible).
12. **Unauthorized Refund**: Un vendeur tente de passer le statut d'une vente à `refunded` (action réservée admin).

## 3. Validation
Toutes les tentatives ci-dessus doivent retourner `PERMISSION_DENIED`.
