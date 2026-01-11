# JHipster View Blueprint

[![NPM version][npm-image]][npm-url]
[![JHipster version][jhipster-image]][jhipster-url]

JHipsterでデータベースViewをサポートするブループリント。

## これは何？

通常、JHipsterはテーブルに対応するエンティティしか生成できません。
このブループリントを使うと、**データベースView**に対応するエンティティを生成できます。

### 主な機能

| 機能 | 説明 |
|------|------|
| JDLアノテーション | `@View`, `@Sql`, `@SqlFile` でView定義 |
| Liquibase対応 | `createView` changelogを自動生成 |
| 読み取り専用Entity | `@Immutable` アノテーション自動付与 |
| REST API | GET のみ（POST/PUT/DELETE 自動削除） |
| フロントエンド | 参照のみ（編集・削除UI非生成） |
| テスト対応 | 統合テストを `@Disabled` で無効化 |

### ユースケース

- レガシーシステムのViewをJHipsterアプリケーションに統合
- 複雑な集計クエリをViewとして定義し、エンティティとして利用
- マスターデータの参照専用エンティティを作成

## 動作環境

- JHipster 8.x
- Node.js 18+
- Java 17+ (JHipsterの要件)

## インストール

### グローバルインストール

```bash
npm install -g generator-jhipster-view-blueprint
```

### ローカル開発

```bash
git clone https://github.com/your-repo/jhipster-view-blueprint.git
cd jhipster-view-blueprint
npm install
npm link
```

## 使い方

### 1. JDLでViewエンティティを定義

#### 方法1: インラインSQL（短いSQL向け）

```jdl
@View
@Sql("SELECT id, name, email FROM customer WHERE active = true")
entity ActiveCustomer {
    name String
    email String
}
```

#### 方法2: SQLファイル参照（複雑なSQL向け）

```jdl
@View
@SqlFile("views/order_statistics.sql")
entity OrderStatistics {
    customerId Long
    customerName String
    totalOrders Integer
    totalAmount BigDecimal
}
```

SQLファイル（`views/order_statistics.sql`）:

```sql
SELECT
    c.id as id,
    c.id as customer_id,
    c.name as customer_name,
    COUNT(o.id) as total_orders,
    SUM(o.amount) as total_amount
FROM customer c
LEFT JOIN orders o ON c.id = o.customer_id
GROUP BY c.id, c.name
```

### 2. JHipsterでアプリケーション生成

```bash
jhipster jdl your-app.jdl --blueprints view-blueprint
```

または既存のJDLに追加：

```bash
jhipster jdl entities.jdl --blueprints view-blueprint
```

### 3. 生成されるファイル

#### バックエンド

| ファイル | 内容 |
|---------|------|
| `domain/ActiveCustomer.java` | `@Immutable` 付きエンティティ |
| `repository/ActiveCustomerRepository.java` | 読み取り専用リポジトリ |
| `web/rest/ActiveCustomerResource.java` | GET エンドポイントのみ |
| `changelog/xxx_create_view_active_customer.xml` | Liquibase createView |

#### フロントエンド

| ファイル | 内容 |
|---------|------|
| `list/active-customer.component.ts` | 一覧表示（編集・削除ボタンなし） |
| `detail/active-customer-detail.component.ts` | 詳細表示（編集ボタンなし） |
| `service/active-customer.service.ts` | `query()`, `find()` のみ |

**生成されないファイル:**
- `update/` コンポーネント
- `delete/` ダイアログ
- new/edit ルーティング

## アーキテクチャ

```
JDL (@View, @Sql/@SqlFile)
        ↓
   JHipsterパーサー
        ↓
  .jhipster/Entity.json (options に保存)
        ↓
┌─────────────────────────────────────────────────┐
│  JHipster View Blueprint                        │
│                                                 │
│  generators/server/generator.js                 │
│  ├── entity.readOnly = true (フロントエンド制御) │
│  ├── @Immutable アノテーション追加               │
│  ├── REST API 書き込みエンドポイント削除         │
│  ├── Service 書き込みメソッド削除                │
│  └── 統合テスト @Disabled 追加                   │
│                                                 │
│  generators/liquibase/generator.js              │
│  ├── createView changelog 生成                  │
│  ├── テーブル定義 changelog 削除                │
│  └── fake-data 削除                             │
└─────────────────────────────────────────────────┘
        ↓
   生成されたコード
   ├── Java (Entity, Repository, Resource)
   ├── Angular/React (List, Detail, Service)
   └── Liquibase (createView XML)
```

## 生成されるLiquibase changelog

```xml
<?xml version="1.0" encoding="utf-8"?>
<databaseChangeLog
    xmlns="http://www.liquibase.org/xml/ns/dbchangelog"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://www.liquibase.org/xml/ns/dbchangelog
        http://www.liquibase.org/xml/ns/dbchangelog/dbchangelog-latest.xsd">

    <changeSet id="20240101120000-create-view-active-customer" author="jhipster">
        <createView viewName="active_customer" replaceIfExists="true">
            SELECT id, name, email FROM customer WHERE active = true
        </createView>
    </changeSet>

</databaseChangeLog>
```

## 制限事項

### Viewエンティティの制限

- **書き込み操作不可**: INSERT/UPDATE/DELETE はできません
- **リレーション**: 他エンティティからViewへの参照は可能ですが、Viewから他エンティティへの書き込みを伴う操作はできません
- **統合テスト**: `@Disabled` により無効化されます（手動でのテスト設計が必要）

### JDLの制限

- `@Sql` のSQL文は1行で記述してください
- 複雑なSQLは `@SqlFile` を使用してください
- SQLファイルはプロジェクトルートからの相対パスで指定します

## トラブルシューティング

### Q: Viewが作成されない

A: 以下を確認してください：

1. JDLに `@View` アノテーションがあるか
2. `@Sql` または `@SqlFile` が正しく設定されているか
3. `@SqlFile` の場合、SQLファイルが存在するか

### Q: フロントエンドに編集ボタンが表示される

A: `entity.readOnly` が正しく設定されていない可能性があります。
`.jhipster/EntityName.json` の `options` に `View` が含まれているか確認してください。

### Q: テストが失敗する

A: Viewエンティティの統合テストは `@Disabled` で無効化されています。
テストを有効にしたい場合は、native SQLで元テーブルにデータを投入する必要があります。

## 開発

### テスト実行

```bash
npm test
```

### ローカルでのテスト

```bash
cd test-app
jhipster jdl app.jdl --skip-jhipster-dependencies --force
```

## ライセンス

Apache-2.0

## 貢献

Issue や Pull Request を歓迎します。

[npm-image]: https://img.shields.io/npm/v/generator-jhipster-view-blueprint.svg
[npm-url]: https://npmjs.org/package/generator-jhipster-view-blueprint
[jhipster-image]: https://img.shields.io/badge/JHipster-8.x-blue.svg
[jhipster-url]: https://www.jhipster.tech/
