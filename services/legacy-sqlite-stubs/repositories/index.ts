import { LegacySqliteStubClass } from '../_helpers';

export class BaseRepository extends LegacySqliteStubClass {}
export class UsersRepository extends LegacySqliteStubClass {}
export class AccountsRepository extends LegacySqliteStubClass {}
export class ContactsRepository extends LegacySqliteStubClass {}
export class VendorsRepository extends LegacySqliteStubClass {}
export class CategoriesRepository extends LegacySqliteStubClass {}
export class TransactionsRepository extends LegacySqliteStubClass {}
export class ChatMessagesRepository extends LegacySqliteStubClass {}
export class PersonalCategoriesRepository extends LegacySqliteStubClass {}
export class PersonalTransactionsRepository extends LegacySqliteStubClass {}
export class AppSettingsRepository extends LegacySqliteStubClass {}
export class AppStateRepository extends LegacySqliteStubClass {}

export type PersonalCategoryRow = Record<string, unknown>;
export type PersonalTransactionRow = Record<string, unknown>;
