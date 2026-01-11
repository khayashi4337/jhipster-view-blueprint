# 対応が必要な項目

## 現在の実装状況

| 機能 | 状態 |
|------|------|
| JDLアノテーション (`@View`, `@Sql`, `@SqlFile`) | ✅ 対応済み |
| Liquibase `createView` 生成 | ✅ 対応済み |
| Entity `@Immutable` 付与 | ✅ 対応済み |
| REST API 読み取り専用化 | ✅ 対応済み |
| フロントエンド 読み取り専用化 | ❌ 未対応 |

---

## 未対応項目一覧

### バックエンド

| # | 対象 | ファイル | 対応内容 | 状態 |
|---|------|----------|----------|------|
| 1 | REST API | `*Resource.java` | POST/PUT/DELETE エンドポイント削除 | ✅ 対応済み |
| 2 | Service | `*Service.java` | save/delete メソッド削除 | ✅ 対応済み（注: serviceなしの場合はスキップ） |
| 3 | Repository | `*Repository.java` | 継承元をReadOnlyに変更検討 | ⚠️ コメント追加のみ |
| 4 | テストコード | `*ResourceIT.java` | POST/PUT/DELETE テスト削除 | ❌ 未対応 |
| 5 | テストコード | `*ServiceTest.java` | save/delete テスト削除 | ❌ 未対応 |
| 6 | OpenAPI | Swagger定義 | POST/PUT/DELETE 定義除外 | ❌ 未対応 |

### フロントエンド

| # | 対象 | ファイル | 対応内容 | 状態 |
|---|------|----------|----------|------|
| 7 | 一覧画面 | `*-list.component.*` | 編集・削除ボタン非表示 | ❌ 未対応 |
| 8 | 詳細画面 | `*-detail.component.*` | 編集ボタン非表示 | ❌ 未対応 |
| 9 | 編集画面 | `*-update.component.*` | 生成しない | ❌ 未対応 |
| 10 | 削除ダイアログ | `*-delete-dialog.component.*` | 生成しない | ❌ 未対応 |
| 11 | APIサービス | `*.service.ts` | create/update/delete メソッド削除 | ❌ 未対応 |
| 12 | ルーティング | `*-routing.module.ts` | new/edit ルート削除 | ❌ 未対応 |
| 13 | テスト | `*.component.spec.ts` | update/delete テスト削除 | ❌ 未対応 |
| 14 | テスト | `*.service.spec.ts` | create/update/delete テスト削除 | ❌ 未対応 |

### Liquibase

| # | 対象 | ファイル | 対応内容 | 状態 |
|---|------|----------|----------|------|
| 15 | fake-data | `fake-data/*.csv` | 生成しない | ❌ 未対応 |
| 16 | テーブル定義 | `*_added_entity_*.xml` | 生成しない（createViewのみ） | ❌ 未対応 |

---

## 設計方針

### dev/prod環境の扱い

**採用案:** Liquibase contextで分離

```xml
<!-- 開発用: テーブルとして作成（テスト用） -->
<changeSet context="dev">
    <createTable tableName="user_summary">...</createTable>
</changeSet>

<!-- 本番用: Viewとして作成 -->
<changeSet context="prod">
    <createView viewName="user_summary">...</createView>
</changeSet>
```

### fake-dataの扱い

**採用案:** このブループリントでは対応しない

- Viewエンティティにはfake-data生成しない
- 元テーブルのデータ整合性はユーザー責任
- 将来的に別ツール（fake-data拡張）で対応検討

---

## 将来的な拡張案

### fake-data View拡張ツール

リレーショナル整合性を意識したfake-data生成ツール：

- 元テーブル間のリレーションを解析
- 整合性のあるテストデータを自動生成
- View開発時のテストを容易にする

**優先度:** 低（このブループリント完成後に検討）

---

## 優先順位

1. ~~**高:** REST API読み取り専用化（#1, #2）~~ ✅ 完了
2. **高:** Liquibaseテーブル定義抑制（#16）
3. **中:** フロントエンド読み取り専用化（#7-#12）
4. **中:** テストコード対応（#4, #5, #13, #14）
5. **低:** OpenAPI対応（#6）
6. **低:** fake-data対応（#15）
