# MyBatis対応 設計メモ

## 背景

- 移行プロジェクトでMyBatisを使用する要件がある
- マスタ管理系はJPA、業務系はMyBatisという構成
- マテリアルビューを多用しており、View + MyBatisの組み合わせが必要
- プロジェクトリーダーの決定事項

## 構成

| 区分 | ORM | 生成物 | APIアクセス |
|------|-----|--------|-------------|
| マスタ系 | JPA | Entity, Repository, REST, Service | REST経由 |
| 業務系 (View) | MyBatis | POJO, Mapper Interface | Thymeleafから直接 |

## 方針

### 別ブループリントではなく、このリポジトリを拡張

**理由:**
- `@View` の意味（読み取り専用、SQL情報）を別ブループリントは知らない
- 共通ライブラリ化は管理が複雑
- 一元管理の方が現実的

### アノテーションによる切り替え

| JDLの記述 | 生成結果 |
|-----------|----------|
| `@View` のみ | JPA Entity (@Immutable) + Repository |
| `@View` + `@MyBatis` | MyBatis POJO + Mapper Interface (読み取り専用) |
| `@MyBatis` のみ | MyBatis POJO + Mapper Interface (CRUD) |

追加のオプションスイッチは不要。`@MyBatis` を書かなければ従来通りJPA。

## 生成物の詳細

### MyBatis POJO (Entity)

```java
// JPAアノテーションなし、シンプルなPOJO
public class OrderSummary {
    private Long id;
    private String customerName;
    private Integer totalOrders;

    // getter/setter (または Lombok @Data)
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
| クラスアノテーション | `@Entity`, `@Table`, `@Immutable` | なし |
| フィールドアノテーション | `@Id`, `@Column` | なし |
| マッピング | アノテーション/XML | Mapper側で定義 |

## 生成しないもの

`@MyBatis` 指定時は以下を生成しない：

- JPA Entity
- JPA Repository
- REST Controller
- Service

## 未決事項

### 1. Lombokの使用

- `@Data` を使うか、getter/setterを生成するか
- JHipster本体の設定に合わせる？

### 2. Mapper XMLの要否

- 現時点では「複雑なクエリはない」とのことでアノテーションベースで十分
- 将来的に必要になれば追加検討

### 3. MyBatis設定ファイル

- `mybatis-config.xml` や Spring Boot設定の自動生成は必要か
- 手動設定で十分か

### 4. フロントエンド（Thymeleaf）との連携

- Controller層の生成は不要（手書き想定）
- Mapper Interfaceを直接DIして使用

## 実装ステップ（案）

1. `@MyBatis` アノテーションの検出ロジック追加
2. MyBatis POJO テンプレート作成
3. Mapper Interface テンプレート作成
4. `@View` + `@MyBatis` の組み合わせ対応
5. `@MyBatis` のみ（CRUD）の対応
6. テスト

## 参考

- [MyBatis公式ドキュメント](https://mybatis.org/mybatis-3/ja/)
- [MyBatis Spring Boot Starter](https://mybatis.org/spring-boot-starter/mybatis-spring-boot-autoconfigure/)
