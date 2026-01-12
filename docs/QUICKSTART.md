# クイックスタート

10分でJHipster View Blueprintを使い始める。

## 前提条件

- Node.js 18.19+ または 20.6+
- JHipster 8.x (`npm install -g generator-jhipster`)

## ステップ1: ブループリントのインストール

```bash
# グローバルインストール
npm install -g generator-jhipster-view-blueprint

# または、このリポジトリをクローンしてリンク
git clone <repo>
cd jhipster-view-blueprint
npm install
npm link
```

## ステップ2: JDLファイルを作成

`app.jdl` を作成：

```jdl
application {
  config {
    baseName myApp
    packageName com.example.myapp
    databaseType sql
    devDatabaseType h2Disk
    prodDatabaseType postgresql
  }
  entities *
}

// 通常のテーブル
entity Customer {
    name String required
    email String required
}

entity Order {
    orderDate Instant required
    totalAmount BigDecimal required
}

relationship ManyToOne {
    Order{customer required} to Customer
}

// ★ これがView！
@View
@Sql("SELECT id, name, email FROM customer WHERE email LIKE '%@example.com'")
entity ExampleCustomer {
    name String
    email String
}

// ★ MyBatis CRUD エンティティ
@MyBatis
entity Product {
    name String required
    price BigDecimal required
    stock Integer
}

// ★ View + MyBatis（読み取り専用）
@View
@Sql("SELECT c.id, c.name, COUNT(o.id) as order_count FROM customer c LEFT JOIN jhi_order o ON c.id = o.customer_id GROUP BY c.id, c.name")
@MyBatis
entity CustomerOrderSummary {
    name String
    orderCount Integer
}
```

## ステップ3: アプリケーション生成

```bash
mkdir my-app && cd my-app
jhipster jdl ../app.jdl --blueprints generator-jhipster-view-blueprint
```

## ステップ4: 確認

生成されたファイルを確認：

```bash
# エンティティに @Immutable があるか確認
grep -n "Immutable" src/main/java/com/example/myapp/domain/ExampleCustomer.java

# Liquibase changelogにcreateViewがあるか確認
cat src/main/resources/config/liquibase/changelog/*create_view*.xml

# MyBatis POJOが生成されたか確認
ls src/main/java/com/example/myapp/mybatis/model/

# Mapper Interfaceが生成されたか確認
ls src/main/java/com/example/myapp/mybatis/mapper/
```

## 複雑なSQLの場合

SQLが長い場合は、ファイルに分けて `@SqlFile` を使う：

### 1. SQLファイルを作成

`views/customer_summary.sql`:

```sql
SELECT
    c.id,
    c.name,
    COUNT(o.id) as order_count,
    SUM(o.total_amount) as total_spent
FROM customer c
LEFT JOIN jhi_order o ON o.customer_id = c.id
GROUP BY c.id, c.name
```

### 2. JDLで参照

```jdl
@View
@SqlFile("views/customer_summary.sql")
entity CustomerSummary {
    name String
    orderCount Integer
    totalSpent BigDecimal
}
```

## MyBatis設定のカスタマイズ

命名規則を変更したい場合は `.yo-rc.json` に設定を追加：

```json
{
  "generator-jhipster-view-blueprint": {
    "mybatis": {
      "modelSuffix": "Model",
      "mapperSuffix": "ModelMapper",
      "modelPackage": "mybatis.model",
      "mapperPackage": "mybatis.mapper"
    }
  }
}
```

## 次のステップ

- [MyBatis設計メモ](MYBATIS_DESIGN.md) - MyBatis対応の詳細
- [FAQ](FAQ.md) - 困ったときに
- [README](../README.md) - 詳細な説明
