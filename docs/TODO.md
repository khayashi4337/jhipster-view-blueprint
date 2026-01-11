# 残課題

## 未対応項目

| # | 対象 | ファイル | 対応内容 | 優先度 |
|---|------|----------|----------|--------|
| 1 | Repository | `*Repository.java` | ReadOnlyRepositoryインターフェース作成 | 低 |
| 2 | OpenAPI | Swagger定義 | 追加のカスタマイズが必要な場合 | 低 |

---

## 詳細

### Repository読み取り専用化

現在はコメント追加のみ。将来的には：

- `ReadOnlyRepository` インターフェースの作成
- 書き込みメソッド（`save`, `delete`等）の完全な除外
- `JpaRepository` から `ReadOnlyRepository` への継承変更

**現状**: `@Immutable` + REST API制限で実質的に読み取り専用は実現済み。
Repository レベルの制限は追加の安全策として検討。

### OpenAPI対応

現在、OpenAPI/Swagger定義は自動生成されたJavaコードから生成されるため、
REST APIから書き込みエンドポイントを削除すれば自動的に反映される。

追加のカスタマイズ（説明文の追加等）が必要な場合のみ対応を検討。

---

## 将来的な拡張案

### dev/prod環境の分離

Liquibase contextで環境ごとにchangelogを分離する案：

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

**優先度**: 低（要望があれば検討）

### fake-data View拡張ツール

リレーショナル整合性を意識したfake-data生成ツール：

- 元テーブル間のリレーションを解析
- 整合性のあるテストデータを自動生成
- View開発時のテストを容易にする

**優先度**: 低（別プロジェクトとして検討）
