export interface UserApiResponse {
    /** 用户唯一标识ID */
    id: number;
    /** 用户名 */
    username: string;
    /** 联系电话（空字符串表示未绑定） */
    phone: string;
    /** 绑定邮箱地址 */
    email: string;
    /** 应用唯一标识ID */
    app_id: string;
    /** API密钥（用于接口鉴权） */
    secret_key: string;
    /** 接口超时时间（单位：秒） */
    time_out: number;
    /** 
     * 账号状态标识
     * @1 有效状态
     * @0 无效状态 
     */
    is_valid: 0 | 1;
    /** 有效期截止时间（格式：YYYY-MM-DD HH:mm:ss） */
    valid_at: string;
    /** 可用次数 */
    available_count: number;
    /** 已使用的API请求次数 */
    request_count: number;
    /** 记录创建时间（格式：YYYY-MM-DD HH:mm:ss） */
    created_at: string;
    /** 最后更新时间（格式：YYYY-MM-DD HH:mm:ss） */
    updated_at: string;
    /** 
     * 软删除时间戳
     * @null 表示未被删除
     * @string 删除时间（格式：YYYY-MM-DD HH:mm:ss）
     */
    deleted_at: string | null;
}