# MyBatis対応 設計メモ

## 想定

- マスタ管理系はJPA、業務系はMyBatisという構成
- マテリアルビューを多用しており、View + MyBatisの組み合わせが必要


## 構成

| 区分 | ORM | 生成物 | APIアクセス |
|------|-----|--------|-------------|
| マスタ系 | JPA | Entity, Repository, REST, Service | REST経由 |
| 業務系 (View) | MyBatis | POJO, Mapper Interface | Thymeleafから直接 |

## 方針

### 別ブループリントではなく、このjhipster-view-blueprintリポジトリを拡張する理由

- `@View` の意味（読み取り専用、SQL情報）を別ブループリントは知らない
- 共通ライブラリ化は管理が複雑
- 一元管理の方が現実的

### アノテーションによる切り替え

| JDLの記述 | 生成結果 |
|-----------|----------|
| （アノテーションなし） | JPA Entity + Repository |
| `@View` のみ | JPA Entity (@Immutable) + Repository |
| `@View` + `@MyBatis` | MyBatis POJO + Mapper Interface (読み取り専用) |
| `@MyBatis` のみ | MyBatis POJO + Mapper Interface (CRUD) |

`@View` / `@MyBatis` をどちらも書かなければ従来通りJPAのみ。

## 生成物の詳細

### MyBatis POJO (Entity)

```java
@Data
public class OrderSummary {
    private Long id;
    private String customerName;
    private Integer totalOrders;
}
```

### Mapper Interface

**`@View` + `@MyBatis` の場合（読み取り専用）:**

```java
@Mapper
public interface OrderSummaryMapper {
    @Select("SELECT id, customer_name, total_orders FROM order_summary")
    List<OrderSummary> findAll();

    @Select("SELECT id, customer_name, total_orders FROM order_summary WHERE id = #{id}")
    OrderSummary findById(Long id);
}
```

**`@MyBatis` のみの場合（CRUD）:**

```java
@Mapper
public interface CustomerMapper {
    @Select("SELECT * FROM customer")
    List<Customer> findAll();

    @Select("SELECT * FROM customer WHERE id = #{id}")
    Customer findById(Long id);

    @Insert("INSERT INTO customer (name, email) VALUES (#{name}, #{email})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    void insert(Customer customer);

    @Update("UPDATE customer SET name = #{name}, email = #{email} WHERE id = #{id}")
    void update(Customer customer);

    @Delete("DELETE FROM customer WHERE id = #{id}")
    void deleteById(Long id);
}
```

## JPA vs MyBatis Entity の違い

| 項目 | JPA | MyBatis |
|------|-----|---------|
| クラスアノテーション | `@Entity`, `@Table`, `@Immutable` | なし（`@Data` のみ） |
| フィールドアノテーション | `@Id`, `@Column` | なし |
| マッピング | アノテーション/XML | Mapper側で定義 |
| EntityManager | ✅ 管理対象 | ❌ 管理対象外 |

### クラス共存について

JPA EntityとMyBatis POJOは別クラスとして共存可能。

- JPA Entity: `@Entity` あり → EntityManager管理対象
- MyBatis POJO: `@Entity` なし → EntityManager管理対象外

**パッケージ分離:**

```
src/main/java/com/example/
├── domain/              # JPA Entity（EntityManager管理）
│   └── Customer.java    # @Entity あり
└── mybatis/model/       # MyBatis POJO（管理対象外）
    └── CustomerDto.java # @Entity なし、@Data あり
```

## 決定事項

| 項目 | 決定 | 理由 |
|------|------|------|
| Lombok | `@Data` を使用 | シンプルなPOJO生成 |
| Mapper XML | 生成しない | マテリアルビューが複雑なSQLを吸収、Mapperは単純なSELECTのみ |
| MyBatis設定 | Needleで自動追記 | `application.yml` に安全に追記可能 |
| Controller | 対象外 | 既存システムの画面を再現するため手書き |

### MyBatis設定の自動追記

JHipsterのNeedle機能を使用して `application.yml` に追記：

```yaml
# jhipster-needle-application-properties
mybatis:
  type-aliases-package: com.example.mybatis.model
  configuration:
    map-underscore-to-camel-case: true
```

## 実装ステップ（案）

1. `@MyBatis` アノテーションの検出ロジック追加
2. MyBatis POJO テンプレート作成（`@Data` 付き）
3. Mapper Interface テンプレート作成（アノテーションベース）
4. `application.yml` へのNeedle追記実装
5. `@View` + `@MyBatis` の組み合わせ対応
6. `@MyBatis` のみ（CRUD）の対応
7. テスト

## 参考

- [MyBatis公式ドキュメント](https://mybatis.org/mybatis-3/ja/)
- [MyBatis Spring Boot Starter](https://mybatis.org/spring-boot-starter/mybatis-spring-boot-autoconfigure/)
