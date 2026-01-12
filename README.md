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
| MyBatis対応 | `@MyBatis` でPOJO + Mapper Interface生成 |

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

## MyBatis対応

`@MyBatis` アノテーションを使用すると、JPA Entityに加えてMyBatis用のPOJOとMapper Interfaceを追加生成します。

**重要**: `@MyBatis` はJPA生成の「置き換え」ではなく「追加生成」です。マスタ管理画面はJPAベースで自動生成されるため、JPA Entityは常に生成されます。

### ユースケース

- マスタ管理系はJPA（JHipster標準）、業務ロジックはMyBatisという構成
- マテリアルビューを多用しており、View + MyBatisの組み合わせが必要
- Thymeleafなどのサーバーサイドテンプレートから直接MyBatis Mapperを使用

### アノテーションの組み合わせ

| JDLの記述 | JPA生成 | MyBatis生成 |
|-----------|---------|-------------|
| （アノテーションなし） | Entity + Repository + REST + Service | なし |
| `@View` のみ | Entity (@Immutable) + Repository + REST + Service | なし |
| `@View` + `@MyBatis` | Entity (@Immutable) + Repository + REST + Service | POJO + Mapper (読み取り専用) |
| `@MyBatis` のみ | Entity + Repository + REST + Service | POJO + Mapper (CRUD) |

### JDL例

#### @MyBatis のみ（CRUD操作）

```jdl
@MyBatis
entity Product {
    name String required
    price BigDecimal
}
```

この場合、通常のJPA Entity/Repository/REST/Serviceに加えて、以下のMyBatisクラスが生成されます：

- `mybatis/model/ProductModel.java` - CRUD用POJO
- `mybatis/mapper/ProductModelMapper.java` - CRUD Mapper（findAll, findById, insert, update, delete）

#### @View + @MyBatis（読み取り専用）

```jdl
@View
@Sql("SELECT p.id, p.name, SUM(quantity) as total_sold FROM product p LEFT JOIN order_item oi ON p.id = oi.product_id GROUP BY p.id, p.name")
@MyBatis
entity ProductSalesSummary {
    name String
    totalSold Integer
}
```

この場合、読み取り専用のJPA EntityとMyBatisクラスが生成されます：

- JPA: `@Immutable` 付きEntity、GET専用REST API
- MyBatis: 読み取り専用Mapper（findAll, findByIdのみ）

### 生成されるMyBatisファイル

| ファイル | 内容 |
|---------|------|
| `mybatis/model/ProductModel.java` | `@Data` 付きPOJO |
| `mybatis/mapper/ProductModelMapper.java` | Mapper Interface |

#### POJO例

```java
package com.example.mybatis.model;

import lombok.Data;

@Data
public class ProductModel {
    private Long id;
    private String name;
    private BigDecimal price;
}
```

#### Mapper例（CRUD）

```java
package com.example.mybatis.mapper;

import com.example.mybatis.model.ProductModel;
import org.apache.ibatis.annotations.*;
import java.util.List;

@Mapper
public interface ProductModelMapper {
    @Select("SELECT * FROM product")
    List<ProductModel> findAll();

    @Select("SELECT * FROM product WHERE id = #{id}")
    ProductModel findById(Long id);

    @Insert("INSERT INTO product (name, price) VALUES (#{name}, #{price})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    void insert(ProductModel product);

    @Update("UPDATE product SET name = #{name}, price = #{price} WHERE id = #{id}")
    void update(ProductModel product);

    @Delete("DELETE FROM product WHERE id = #{id}")
    void deleteById(Long id);
}
```

#### Mapper例（View - 読み取り専用）

```java
package com.example.mybatis.mapper;

import com.example.mybatis.model.ProductSalesSummaryModel;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;
import java.util.List;

@Mapper
public interface ProductSalesSummaryModelMapper {
    @Select("SELECT * FROM product_sales_summary")
    List<ProductSalesSummaryModel> findAll();

    @Select("SELECT * FROM product_sales_summary WHERE id = #{id}")
    ProductSalesSummaryModel findById(Long id);
}
```

### MyBatis設定

`.yo-rc.json` でMyBatisの命名規則をカスタマイズできます：

```json
{
  "generator-jhipster": { ... },
  "generator-jhipster-view-blueprint": {
    "mybatis": {
      "modelSuffix": "Model",
      "mapperSuffix": "ModelMapper"
    }
  }
}
```

| 設定項目 | デフォルト値 | 説明 |
|----------|-------------|------|
| `modelSuffix` | `Model` | POJO クラス名の接尾辞 |
| `mapperSuffix` | `ModelMapper` | Mapper Interface 名の接尾辞 |

## アーキテクチャ

```
JDL (@View, @Sql/@SqlFile, @MyBatis)
        |
   JHipsterパーサー
        |
  .jhipster/Entity.json (options に保存)
        |
+-------------------------------------------------------------+
|  JHipster View Blueprint                                    |
|                                                             |
|  generators/server/generator.js                             |
|  +-- entity.readOnly = true (フロントエンド制御)            |
|  +-- @Immutable アノテーション追加                          |
|  +-- REST API 書き込みエンドポイント削除                    |
|  +-- Service 書き込みメソッド削除                           |
|  +-- 統合テスト @Disabled 追加                              |
|                                                             |
|  generators/liquibase/generator.js                          |
|  +-- createView changelog 生成                              |
|  +-- テーブル定義 changelog 削除                            |
|  +-- fake-data 削除                                         |
|                                                             |
|  generators/mybatis/generator.js                            |
|  +-- @MyBatis 検出                                          |
|  +-- POJO (@Data) 生成                                      |
|  +-- Mapper Interface 生成                                  |
|  +-- @View有無でCRUD/読み取り専用を切り替え                 |
+-------------------------------------------------------------+
        |
   生成されたコード
   +-- Java (Entity, Repository, Resource)
   +-- Angular/React (List, Detail, Service)
   +-- Liquibase (createView XML)
   +-- MyBatis (POJO, Mapper Interface)  <-- @MyBatis時のみ
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

### MyBatisの制限

- Mapper XMLは生成されません（アノテーションベースのみ）
- Controllerは生成されません（業務ロジックは手書き前提）
- 複雑なクエリはViewとして定義し、Mapperはシンプルに保つ設計です

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

### Q: MyBatisクラスが生成されない

A: 以下を確認してください：

1. JDLに `@MyBatis` アノテーションがあるか
2. `.jhipster/EntityName.json` の `options` に `MyBatis` が含まれているか
3. ブループリントが正しくインストールされているか（`npm list -g generator-jhipster-view-blueprint`）

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
