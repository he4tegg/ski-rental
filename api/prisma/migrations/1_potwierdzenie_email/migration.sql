-- F-01: konto aktywne do logowania dopiero po potwierdzeniu adresu e-mail
ALTER TABLE uzytkownik ADD COLUMN email_potwierdzony BOOLEAN NOT NULL DEFAULT FALSE;
